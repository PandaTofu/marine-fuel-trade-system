"""Small, dependency-free XLSX writer. Text cells are always literal, not formulas."""
from decimal import Decimal
from io import BytesIO
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape
import re


def clean(value):
    return escape(re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', str(value)))


def column(n):
    result = ''
    while n:
        n, rem = divmod(n - 1, 26)
        result = chr(65 + rem) + result
    return result


def workbook(sheets):
    output = BytesIO()
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + ''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1, len(sheets)+1)) + '</Types>')
        archive.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr('xl/workbook.xml', f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + ''.join(f'<sheet name="{clean(name)}" sheetId="{i}" r:id="rId{i}"/>' for i, (name, _) in enumerate(sheets, 1)) + '</sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + ''.join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1,len(sheets)+1)) + '</Relationships>')
        for i, (_, rows) in enumerate(sheets, 1):
            rendered = []
            for r, row in enumerate(rows, 1):
                cells = []
                for c, value in enumerate(row, 1):
                    ref = f'{column(c)}{r}'
                    if isinstance(value, (Decimal, int)) and not isinstance(value, bool):
                        cells.append(f'<c r="{ref}"><v>{value}</v></c>')
                    else:
                        cells.append(f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{clean(value if value is not None else "")}</t></is></c>')
                rendered.append(f'<row r="{r}">{"".join(cells)}</row>')
            archive.writestr(f'xl/worksheets/sheet{i}.xml', f'<worksheet xmlns="{ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><sheetData>{"".join(rendered)}</sheetData></worksheet>')
    return output.getvalue()
