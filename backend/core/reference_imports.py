"""Parse and import customer, supplier and oil reference files."""
import csv
import re
from io import StringIO

from django.db import transaction
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError

from .models import Audit, Reference


KINDS = {'customer', 'supplier', 'oil'}
CODE_PREFIX = {'customer': 'CU', 'supplier': 'SU', 'oil': 'PR'}


def decode_upload(content):
    for encoding in ('utf-8-sig', 'gb18030'):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValidationError({'file': ['invalid_reference_file']})


def clean(value):
    value = str(value or '').strip()
    return '' if value in {'—', '-', '未设置'} else value


def parse_rows(content, kind):
    if kind not in KINDS:
        raise ValidationError({'kind': ['invalid_reference_kind']})
    text = decode_upload(content)
    rows = []
    if kind == 'customer':
        delimiter = '\t' if '\t' in text.splitlines()[0] else ','
        reader = csv.DictReader(StringIO(text), delimiter=delimiter)
        if not reader.fieldnames or not {'客户编号', '客户名称'}.issubset(reader.fieldnames):
            raise ValidationError({'file': ['invalid_reference_file']})
        for source in reader:
            rows.append({
                'source_code': clean(source.get('客户编号')),
                'name': clean(source.get('客户名称')),
                'email': clean(source.get('邮箱账号')),
            })
    else:
        prefix = CODE_PREFIX[kind]
        lines = text.splitlines()
        for index, line in enumerate(lines):
            code = line.strip().split('\t', 1)[0]
            if not re.fullmatch(rf'{prefix}\d+', code, flags=re.IGNORECASE):
                continue
            name = clean(lines[index + 1]) if index + 1 < len(lines) else ''
            rows.append({'source_code': code, 'name': name, 'email': ''})
    if not rows:
        raise ValidationError({'file': ['invalid_reference_file']})
    return rows


def prepare_import(content, kind):
    sources = parse_rows(content, kind)
    existing = {name.casefold() for name in Reference.objects.filter(kind=kind).values_list('name', flat=True)}
    seen = set()
    rows = []
    for source in sources:
        name_key = source['name'].casefold()
        errors = []
        if not source['name'] or len(source['name']) > 120:
            errors.append('invalid_reference_name')
        if source['email'] and len(source['email']) > 254:
            errors.append('invalid_reference_email')
        elif source['email']:
            try:
                validate_email(source['email'])
            except DjangoValidationError:
                errors.append('invalid_reference_email')
        if errors:
            result = 'invalid'
        elif name_key in existing or name_key in seen:
            result = 'duplicate'
        else:
            result = 'ready'
        seen.add(name_key)
        rows.append({**source, 'result': result, 'errors': errors})
    return rows


def result_payload(rows):
    counts = {key: sum(row['result'] == key for row in rows) for key in ('ready', 'duplicate', 'invalid')}
    return {'summary': {'total': len(rows), **counts}, 'rows': rows}


@transaction.atomic
def import_references(content, kind, actor):
    # Serialize imports so two administrators cannot create the same names concurrently.
    list(Reference.objects.select_for_update().filter(kind=kind).values_list('id', flat=True))
    rows = prepare_import(content, kind)
    created = 0
    for item in rows:
        if item['result'] != 'ready':
            continue
        row = Reference.objects.create(
            kind=kind,
            name=item['name'],
            email=item['email'] if kind == 'customer' else '',
            unit='MT' if kind == 'oil' else '',
            is_active=True,
        )
        row.assign_code()
        created += 1
    Audit.objects.create(actor=actor, action='references_imported', target=f'{kind}:{created}')
    payload = result_payload(rows)
    payload['created'] = created
    return payload
