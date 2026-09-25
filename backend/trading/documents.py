"""Simple order PDFs modelled on the supplied invoice and contract templates."""
from decimal import Decimal
from html import escape
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .calculations import money as rounded_money, order_numbers


COMPANY = 'Bond Shipping and Trading Limited'
COMPANY_ADDRESS = 'ROOM E18, NO.107, 1/F, BLK A, HANGWAI IND CTR, NO.6, KIN TAI ST, TUEN MUN, N.T., HONG KONG'
COMPANY_EMAIL = 'bunker@bond-shipping.com'
SALES_TERMS = (
    'Delivery always subject to weather conditions.',
    "Overtime / extra charges, if any, are for Buyer's account.",
    'Notice for quality complaints must be made within 14 days from delivery.',
    'The Seller retains title to supplied products until invoices are fully settled.',
)
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))


def value(text):
    return escape(str(text or ''))


def money(number):
    return f'US${rounded_money(number):,.2f}'


def day(value_, long=False):
    if not value_:
        return ''
    return value_.strftime('%B %d, %Y' if long else '%d/%m/%Y')


def order_number(order):
    return order.number


def document_defaults(order, kind):
    number = order_number(order)
    numbers = order_numbers(order)
    eta = ''
    if order.estimated_start_date and order.estimated_end_date:
        eta = f'{day(order.estimated_start_date)} - {day(order.estimated_end_date)}'
    if kind == 'contract':
        minimum = sum((rounded_money(line.ordered_qty_min * line.sale_price) for line in order.lines.all()), Decimal('0'))
        maximum = sum((rounded_money(line.ordered_qty_max * line.sale_price) for line in order.lines.all()), Decimal('0'))
        total = money(minimum) if minimum == maximum else f'{money(minimum)} - {money(maximum)}'
        return {
            'reference': number, 'date': day(order.order_date, True),
            'intro': 'Following your orders and further our telecom, we confirm having arranged the following bunkers.',
            'vessel': order.vessel, 'imo': order.imo, 'port': order.port, 'eta': eta,
            'buyer': order.customer, 'seller': COMPANY, 'supplier': order.supplier,
            'products': [
                {'name': line.oil, 'quantity': range_text(line),
                 'unit_price': f'{money(line.sale_price)} / MT',
                 'amount': money(rounded_money(line.ordered_qty_min * line.sale_price)) if line.ordered_qty_min == line.ordered_qty_max else f'{money(rounded_money(line.ordered_qty_min * line.sale_price))} - {money(rounded_money(line.ordered_qty_max * line.sale_price))}'}
                for line in order.lines.all()
            ],
            'total': total,
            'additional_cost': '\n'.join(
                f'{name}: {money(amount)}' for name, amount in [
                    ('Customer bank fee', order.customer_fee), ('Barge fee', order.berth_fee),
                    ('Exceptional fee', order.exceptional_fee)] if amount),
            'payment': order.customer_term_description,
            'terms': '\n'.join(SALES_TERMS),
            'closing': 'Please confirm stem in order.\n\nBest Regards,\n' + COMPANY,
        }
    return {
        'reference_number': number, 'invoice_number': number,
        'customer': order.customer, 'vessel': order.vessel, 'imo': order.imo,
        'port': order.port, 'invoice_date': day(timezone.localdate()),
        'delivery_date': day(order.actual_date), 'due_date': day(numbers['customer_due']),
        'customer_reference': '',
        'products': [
            {'name': line.oil, 'quantity': f'{line.actual_qty:.3f}' if line.actual_qty is not None else '',
             'unit': 'MT' if line.actual_qty is not None else '',
             'unit_price': f'{rounded_money(line.sale_price):.2f}',
             'amount': f'{rounded_money((line.actual_qty or 0) * line.sale_price):.2f}' if line.actual_qty is not None else ''}
            for line in order.lines.all()
        ],
        'currency': 'USD', 'beneficiary_name': COMPANY.upper(),
        'beneficiary_address': COMPANY_ADDRESS, 'bank_name': 'DBS BANK (HONGKONG) LIMITED',
        'account_number': '002836028', 'swift': 'DHBKHKHH',
        'bank_address': "G/F, The Center, 99 Queen's Road Central, Central, Hong Kong",
        'remittance_reference': number,
    }


def logo_path():
    return Path(settings.BASE_DIR).parent / 'frontend' / 'public' / 'assets' / 'company-logo.png'


def styles():
    sheet = getSampleStyleSheet()
    body = ParagraphStyle('Body', parent=sheet['BodyText'], fontName='Helvetica', fontSize=8.5, leading=11, spaceAfter=0)
    small = ParagraphStyle('Small', parent=body, fontSize=7.2, leading=9)
    return sheet, body, small


def header(company_address, email):
    sheet, body, small = styles()
    path = logo_path()
    mark = Image(str(path), width=35*mm, height=20*mm, kind='proportional') if path.exists() else ''
    name = f'<b><font size="18" color="#101b70">{COMPANY}</font></b>'
    block = Table([[mark, Paragraph(name, body)]], colWidths=[40*mm, 137*mm])
    block.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0)]))
    contact = Paragraph(f'Address: {value(company_address)} &nbsp;&nbsp;&nbsp; Email: {value(email)}', small)
    line = Table([[contact]], colWidths=[177*mm])
    line.setStyle(TableStyle([('LINEBELOW',(0,0),(-1,-1),1,colors.HexColor('#147d92')),('LEFTPADDING',(0,0),(-1,-1),0)]))
    return [block, line, Spacer(1, 7*mm)]


def pdf(story, title):
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=16*mm, leftMargin=16*mm, topMargin=12*mm, bottomMargin=12*mm,
                            title=title, author=COMPANY)
    doc.build(story)
    return output.getvalue()


def label_table(rows, widths=(33*mm, 55*mm, 34*mm, 55*mm)):
    _, body, _ = styles()
    data=[]
    for row in rows:
        data.append([Paragraph(f'<b>{value(row[0])}</b>',body),Paragraph(value(row[1]),body),Paragraph(f'<b>{value(row[2])}</b>',body),Paragraph(value(row[3]),body)])
    table=Table(data,colWidths=list(widths),hAlign='LEFT')
    table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),2),('RIGHTPADDING',(0,0),(-1,-1),2),('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
    return table


def invoice_pdf(order, content=None):
    sheet, body, small = styles()
    data = {**document_defaults(order, 'invoice'), **(content or {})}
    number = data['reference_number']
    story = header(COMPANY_ADDRESS, COMPANY_EMAIL)
    story += [Paragraph('<u><b>SALES INVOICE</b></u>', sheet['Heading3']), Spacer(1, 5*mm),
              Paragraph('Master and Owners and /or Managing Owners and/or Operators and/or Charterers and /or Buyers', body),
              Paragraph(f'of <b>{value(data["vessel"])}</b> and:', body), Paragraph(f'<b>{value(data["customer"])}</b>', body), Spacer(1, 3*mm)]
    story.append(label_table([
        ('Reference Number',number,'Invoice Number',data['invoice_number']),('Vessel Name',data['vessel'],'Invoicing Date',data['invoice_date']),
        ('IMO Number',data['imo'],'Delivery Date',data['delivery_date']),('Port of Delivery',data['port'],'Due Date',data['due_date']),
        ('Customer Reference',data['customer_reference'],'',''),
    ]))
    rows=[[Paragraph('<b>Product</b>',body),Paragraph('<b>Quantity</b>',body),Paragraph('<b>Unit</b>',body),Paragraph('<b>Unit Price</b>',body),Paragraph('<b>Value</b>',body)]]
    subtotal=Decimal('0')
    for line in data['products']:
        try: amount = Decimal(str(line.get('amount') or '0'))
        except Exception: amount = Decimal('0')
        subtotal += amount
        rows.append([Paragraph(value(line.get('name')),body),value(line.get('quantity')),value(line.get('unit')),value(line.get('unit_price')),money(amount) if line.get('amount') else ''])
    products=Table(rows,colWidths=[63*mm,25*mm,18*mm,34*mm,37*mm],repeatRows=1)
    products.setStyle(TableStyle([('LINEBELOW',(0,0),(-1,0),.6,colors.black),('ALIGN',(1,0),(-1,-1),'RIGHT'),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    story += [Spacer(1,2*mm),products]
    totals=Table([['SUBTOTAL',money(subtotal)],['VAT AT 0 %',money(0)],['TOTAL AMOUNT',money(subtotal)]],colWidths=[140*mm,37*mm])
    totals.setStyle(TableStyle([('ALIGN',(1,0),(-1,-1),'RIGHT'),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTNAME',(0,2),(-1,2),'Helvetica-Bold'),('LINEABOVE',(0,0),(-1,0),.6,colors.black),('LINEBELOW',(0,2),(-1,2),.6,colors.black)]))
    story += [Spacer(1,2*mm),totals,Spacer(1,3*mm)]
    bank=[('PAYMENT INSTRUCTIONS','BY ELECTRONIC FUND TRANSFER'),('CURRENCY',data['currency']),('BENEFICIARY NAME',data['beneficiary_name']),
          ('BENEFICIARY ADDRESS',data['beneficiary_address']), ('BANK NAME',data['bank_name']),
          ('ACCOUNT NR / IBAN NR',data['account_number']),('SWIFT',data['swift']),
          ('BANK ADDRESS',data['bank_address']),('REMITTANCE REFERENCE',data['remittance_reference'])]
    bank_table=Table([[Paragraph(value(k),small),Paragraph(f'<b>{value(v)}</b>',small)] for k,v in bank],colWidths=[43*mm,134*mm])
    bank_table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),1),('TOPPADDING',(0,0),(-1,-1),1),('BOTTOMPADDING',(0,0),(-1,-1),1)]))
    story += [bank_table,Spacer(1,2*mm),Paragraph('LATE PAYMENT WILL BE CHARGED WITH 2% INTEREST MONTHLY PRORATED FROM THE DUE DATE.<br/><b>ALL BANK CHARGES ARE FOR SENDERS ACCOUNT</b>',small),Spacer(1,3*mm),Paragraph('<b><font color="red">FRAUD PREVENTION</font> // IF THE BANK DETAILS DO NOT MATCH THE ALREADY REGISTERED<br/>PLEASE CONTACT US IMMEDIATELY</b>',small)]
    return pdf(story,f'Sales Invoice {number}')


def range_text(line):
    if line.ordered_qty_min == line.ordered_qty_max:
        return f'{line.ordered_qty_min:.3f} MT'
    return f'{line.ordered_qty_min:.3f} - {line.ordered_qty_max:.3f} MT'


def contract_pdf(order, content=None):
    sheet, body, small = styles()
    data = {**document_defaults(order, 'contract'), **(content or {})}
    number=data['reference']
    story=header(COMPANY_ADDRESS, COMPANY_EMAIL)
    title=ParagraphStyle('ContractTitle',parent=sheet['Heading1'],fontName='Helvetica-Bold',fontSize=17,alignment=TA_CENTER,spaceAfter=8)
    right=ParagraphStyle('Right',parent=body,alignment=TA_RIGHT)
    story += [Paragraph('BUNKER CONFIRMATION',title),Paragraph(f'Ref: {value(number)}<br/>Date: {value(data["date"])}',right),Spacer(1,4*mm),
              Paragraph(value(data['intro']),body),Spacer(1,3*mm),Paragraph('<b>Vessel Information</b>',sheet['Heading3'])]
    vessel=Table([[Paragraph(f'<b>{k}</b>',body),Paragraph(value(v),body)] for k,v in [('Vessel:',data['vessel']),('IMO:',data['imo']),('Port:',data['port']),('ETA:',data['eta']),('Buyer:',data['buyer']),('Seller:',data['seller']),('Supplier:',data['supplier'])]],colWidths=[24*mm,153*mm])
    vessel.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
    rows=[[Paragraph('<b>Product Name</b>',body),Paragraph('<b>Quantity</b>',body),Paragraph('<b>Price / Unit</b>',body),Paragraph('<b>Amount</b>',body)]]
    for line in data['products']:
        rows.append([Paragraph(value(line.get('name')),body),value(line.get('quantity')),value(line.get('unit_price')),value(line.get('amount'))])
    rows.append([Paragraph('<b>Total</b>', body), '', '', Paragraph(f'<b>{value(data["total"])}</b>', body)])
    products=Table(rows,colWidths=[53*mm,40*mm,45*mm,39*mm],repeatRows=1)
    products.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.5,colors.HexColor('#30343a')),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#edf1f4')),('BACKGROUND',(0,-1),(-1,-1),colors.HexColor('#edf1f4')),('ALIGN',(1,0),(-1,-1),'RIGHT'),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    additional='<br/>'.join(value(line) for line in str(data['additional_cost']).splitlines())
    terms='<br/>'.join(f'{index}. {value(term)}' for index,term in enumerate(str(data['terms']).splitlines(),1) if term.strip())
    closing='<br/>'.join(value(line) for line in str(data['closing']).splitlines())
    story += [vessel,Spacer(1,3*mm),products,Spacer(1,3*mm),Paragraph('<b>Additional Cost</b>',sheet['Heading3']),Paragraph(additional,body),Spacer(1,2*mm),Paragraph('<b>Payment</b>',sheet['Heading3']),Paragraph(value(data['payment']),body),Spacer(1,2*mm),Paragraph('<b>Terms of Sale</b>',sheet['Heading3']),Paragraph(terms,body),Spacer(1,5*mm),KeepTogether([Paragraph(f'<b>{closing}</b>',body)]),Spacer(1,4*mm),Paragraph('Customer reference: &nbsp; · &nbsp; Payment instruction: BY ELECTRONIC FUND TRANSFER',small)]
    return pdf(story,f'Bunker Confirmation {number}')
