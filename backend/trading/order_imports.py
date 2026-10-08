"""Read the documented two-sheet order workbook without an Excel runtime dependency."""
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from io import BytesIO
from zipfile import BadZipFile, ZipFile
from xml.etree import ElementTree as ET

from django.db import transaction
from core.models import Reference
from .documents import document_defaults
from .models import Order, OrderDocument, OrderLine
from .services import BusinessError, revision


NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL_NS = {'r': 'http://schemas.openxmlformats.org/package/2006/relationships'}
STATUS = {
    '草稿': 'draft', 'draft': 'draft',
    '已确认': 'confirmed', 'confirmed': 'confirmed',
    '已供油': 'supplied', 'supplied': 'supplied',
    '已完成': 'completed', 'completed': 'completed',
    '已作废': 'void', '作废': 'void', 'void': 'void',
}
SUMMARY_HEADERS = {'订单编号', '订单日期', '客户名称', '船名', '港口', '供应商', '业务状态'}
LINE_HEADERS = {'订单编号', '油品名称', '订单数量（区间）', '实际数量', '销售单价（USD/MT）', '供应商成本单价（USD/MT）'}


def _column(reference):
    letters = ''.join(character for character in reference if character.isalpha())
    result = 0
    for character in letters:
        result = result * 26 + ord(character.upper()) - 64
    return result - 1


def _rows(archive, path, shared):
    root = ET.fromstring(archive.read(path))
    result = []
    for row in root.findall('.//m:sheetData/m:row', NS):
        values = {}
        for cell in row.findall('m:c', NS):
            index = _column(cell.attrib.get('r', 'A1'))
            cell_type = cell.attrib.get('t')
            value = cell.find('m:v', NS)
            inline = cell.find('m:is/m:t', NS)
            raw = inline.text if inline is not None else value.text if value is not None else ''
            if cell_type == 's' and raw != '':
                raw = shared[int(raw)]
            values[index] = raw or ''
        if values:
            result.append([values.get(index, '') for index in range(max(values) + 1)])
    return result


def read_workbook(content):
    try:
        archive = ZipFile(BytesIO(content))
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared_root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
            shared = [''.join(node.text or '' for node in item.findall('.//m:t', NS)) for item in shared_root.findall('m:si', NS)]
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        relations = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        targets = {item.attrib['Id']: item.attrib['Target'] for item in relations.findall('r:Relationship', REL_NS)}
        sheets = {}
        relation_key = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
        for sheet in workbook.findall('.//m:sheets/m:sheet', NS):
            target = targets[sheet.attrib[relation_key]].lstrip('/')
            path = target if target.startswith('xl/') else 'xl/' + target
            sheets[sheet.attrib['name']] = _rows(archive, path, shared)
        return sheets
    except (BadZipFile, KeyError, ET.ParseError, ValueError, IndexError):
        raise BusinessError('invalid_order_workbook')


def _records(rows, required):
    if not rows:
        raise BusinessError('invalid_order_workbook')
    headers = [str(value).strip() for value in rows[0]]
    if not required.issubset(set(headers)):
        raise BusinessError('invalid_order_workbook')
    return [dict(zip(headers, row + [''] * (len(headers) - len(row)))) for row in rows[1:] if any(str(value).strip() for value in row)]


def _text(value):
    return str(value or '').strip()


def _date(value):
    value = _text(value)
    if not value:
        return None
    try:
        if value.replace('.', '', 1).isdigit():
            return date(1899, 12, 30) + timedelta(days=int(float(value)))
        return datetime.fromisoformat(value.replace('/', '-')).date()
    except (ValueError, OverflowError):
        return None


def _decimal(value, default=Decimal('0')):
    value = _text(value).replace(',', '').replace('$', '')
    if not value:
        return default
    try:
        return Decimal(value)
    except InvalidOperation:
        return default


def _quantity_range(value):
    text = _text(value).replace('–', '-').replace('—', '-').replace('~', '-')
    parts = [part.strip() for part in text.split('-', 1)] if text else ['0']
    minimum = _decimal(parts[0])
    maximum = _decimal(parts[-1])
    return (minimum, maximum) if minimum <= maximum else (maximum, minimum)


def _reference(kind, name, references):
    return references.get((kind, name.casefold())) if name else None


def prepare_import(content):
    sheets = read_workbook(content)
    summaries = _records(sheets.get('订单汇总'), SUMMARY_HEADERS)
    details = _records(sheets.get('油品明细'), LINE_HEADERS)
    grouped = defaultdict(list)
    for detail in details:
        grouped[_text(detail.get('订单编号'))].append(detail)
    existing = set(Order.objects.filter(number__in=[_text(row.get('订单编号')) for row in summaries]).values_list('number', flat=True))
    references = {(row.kind, row.name.casefold()): row for row in Reference.objects.filter(is_active=True)}
    seen = set()
    rows = []
    for source in summaries:
        number = _text(source.get('订单编号'))
        errors = []
        if not number or len(number) > 20:
            errors.append('invalid_number')
        if number in seen or number in existing:
            result = 'duplicate'
        else:
            result = 'ready'
        seen.add(number)
        order_date = _date(source.get('订单日期'))
        if not order_date:
            errors.append('invalid_order_date')
        line_sources = grouped.get(number, [])
        if not line_sources:
            errors.append('missing_lines')
        lines = []
        for position, line in enumerate(line_sources):
            oil = _text(line.get('油品名称'))
            if not oil:
                errors.append('missing_oil')
                continue
            minimum, maximum = _quantity_range(line.get('订单数量（区间）'))
            actual_text = _text(line.get('实际数量'))
            lines.append({
                'position': position,
                'oil': oil,
                'oil_reference': _reference('oil', oil, references),
                'ordered_qty_min': minimum,
                'ordered_qty_max': maximum,
                'actual_qty': _decimal(actual_text) if actual_text else None,
                'sale_price': _decimal(line.get('销售单价（USD/MT）')),
                'cost_price': _decimal(line.get('供应商成本单价（USD/MT）')),
            })
        if errors:
            result = 'invalid'
        customer, supplier = _text(source.get('客户名称')), _text(source.get('供应商'))
        port, salesperson = _text(source.get('港口')), _text(source.get('销售人员'))
        rows.append({
            'number': number, 'result': result, 'errors': errors, 'line_count': len(lines),
            'values': {
                'number': number, 'order_date': order_date, 'customer': customer,
                'customer_reference': _reference('customer', customer, references),
                'supplier': supplier, 'supplier_reference': _reference('supplier', supplier, references),
                'vessel': _text(source.get('船名')), 'port': port,
                'port_reference': _reference('port', port, references),
                'salesperson': salesperson,
                'salesperson_reference': _reference('salesperson', salesperson, references),
                'actual_date': _date(source.get('实际供货日期')),
                'note': _text(source.get('备注')), 'currency': 'USD',
                'state': STATUS.get(_text(source.get('业务状态')).casefold(), 'draft'),
            },
            'lines': lines,
        })
    orphan_count = sum(len(value) for key, value in grouped.items() if key not in seen)
    return rows, orphan_count


def result_payload(rows, orphan_count):
    counts = {key: sum(row['result'] == key for row in rows) for key in ('ready', 'duplicate', 'invalid')}
    return {
        'summary': {'total': len(rows), **counts, 'line_count': sum(row['line_count'] for row in rows), 'orphan_lines': orphan_count},
        'rows': [{key: row[key] for key in ('number', 'result', 'errors', 'line_count')} for row in rows],
    }


@transaction.atomic
def import_orders(content, actor):
    rows, orphan_count = prepare_import(content)
    created = []
    for item in rows:
        if item['result'] != 'ready':
            continue
        order = Order.objects.create(**item['values'])
        OrderLine.objects.bulk_create([OrderLine(order=order, **line) for line in item['lines']])
        OrderDocument.objects.bulk_create([
            OrderDocument(order=order, kind=kind, content=document_defaults(order, kind), updated_by=actor)
            for kind in ('invoice', 'purchase_contract', 'sales_contract')
        ])
        revision(order, actor, 'imported', bump=False)
        created.append(order.pk)
    payload = result_payload(rows, orphan_count)
    payload['created'] = len(created)
    return payload
