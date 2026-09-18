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
    return f'BO-{order.order_date:%Y%m%d}-{order.pk:06d}'


def logo_path():
    return Path(settings.BASE_DIR).parent / 'frontend' / 'public' / 'assets' / 'company-logo.png'


def styles():
    sheet = getSampleStyleSheet()
    body = ParagraphStyle('Body', parent=sheet['BodyText'], fontName='Helvetica', fontSize=8.5, leading=11, spaceAfter=0)
    small = ParagraphStyle('Small', parent=body, fontSize=7.2, leading=9)
    return sheet, body, small


def header(company_address, email, chinese=False):
    sheet, body, small = styles()
    path = logo_path()
    mark = Image(str(path), width=35*mm, height=20*mm, kind='proportional') if path.exists() else ''
    name = f'<b><font size="18" color="#101b70">{COMPANY}</font></b>'
    if chinese:
        name += '<br/><font name="STSong-Light" size="11" color="#101b70">帮 德 航 运 贸 易 有 限 公 司</font>'
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


def invoice_pdf(order):
    sheet, body, small = styles()
    number = order_number(order)
    numbers = order_numbers(order)
    story = header('ROOM E18, NO.107, 1/F, BLK A, HANGWAI IND CTR, NO.6, KIN TAI ST, TUEN MUN, N.T., HONG KONG', 'bunker@bond-shipping.com')
    story += [Paragraph('<u><b>SALES INVOICE</b></u>', sheet['Heading3']), Spacer(1, 5*mm),
              Paragraph('Master and Owners and /or Managing Owners and/or Operators and/or Charterers and /or Buyers', body),
              Paragraph(f'of <b>{value(order.vessel)}</b> and:', body), Paragraph(f'<b>{value(order.customer)}</b>', body), Spacer(1, 3*mm)]
    story.append(label_table([
        ('Reference Number',number,'Invoice Number',number),('Vessel Name',order.vessel,'Invoicing Date',day(timezone.localdate())),
        ('IMO Number',order.imo,'Delivery Date',day(order.actual_date)),('Port of Delivery',order.port,'Due Date',day(numbers['customer_due'])),
        ('Customer Reference','','',''),
    ]))
    rows=[[Paragraph('<b>Product</b>',body),Paragraph('<b>Quantity</b>',body),Paragraph('<b>Unit</b>',body),Paragraph('<b>Unit Price</b>',body),Paragraph('<b>Value</b>',body)]]
    subtotal=Decimal('0')
    for line in order.lines.all():
        has_quantity=line.actual_qty is not None
        amount=rounded_money((line.actual_qty or 0)*line.sale_price)
        if has_quantity: subtotal += amount
        rows.append([Paragraph(value(line.oil),body),f'{line.actual_qty:.3f}' if has_quantity else '', 'MT' if has_quantity else '', money(line.sale_price), money(amount) if has_quantity else ''])
    products=Table(rows,colWidths=[63*mm,25*mm,18*mm,34*mm,37*mm],repeatRows=1)
    products.setStyle(TableStyle([('LINEBELOW',(0,0),(-1,0),.6,colors.black),('ALIGN',(1,0),(-1,-1),'RIGHT'),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    story += [Spacer(1,2*mm),products]
    totals=Table([['SUBTOTAL',money(subtotal)],['VAT AT 0 %',money(0)],['TOTAL AMOUNT',money(subtotal)]],colWidths=[140*mm,37*mm])
    totals.setStyle(TableStyle([('ALIGN',(1,0),(-1,-1),'RIGHT'),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTNAME',(0,2),(-1,2),'Helvetica-Bold'),('LINEABOVE',(0,0),(-1,0),.6,colors.black),('LINEBELOW',(0,2),(-1,2),.6,colors.black)]))
    story += [Spacer(1,2*mm),totals,Spacer(1,3*mm)]
    bank=[('PAYMENT INSTRUCTIONS','BY ELECTRONIC FUND TRANSFER'),('CURRENCY','USD'),('BENEFICIARY NAME',COMPANY.upper()),
          ('BENEFICIARY ADDRESS','ROOM E18, NO.107, 1/F, BLK A, HANGWAI IND CTR, NO.6, KIN TAI ST, TUEN MUN, N.T., HONG KONG'),
          ('BANK NAME','DBS BANK (HONGKONG) LIMITED'),('ACCOUNT NR / IBAN NR','002836028'),('SWIFT','DHBKHKHH'),
          ('BANK ADDRESS',"G/F, The Center, 99 Queen's Road Central, Central, Hong Kong"),('REMITTANCE REFERENCE',number)]
    bank_table=Table([[Paragraph(value(k),small),Paragraph(f'<b>{value(v)}</b>',small)] for k,v in bank],colWidths=[43*mm,134*mm])
    bank_table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),1),('TOPPADDING',(0,0),(-1,-1),1),('BOTTOMPADDING',(0,0),(-1,-1),1)]))
    story += [bank_table,Spacer(1,2*mm),Paragraph('LATE PAYMENT WILL BE CHARGED WITH 2% INTEREST MONTHLY PRORATED FROM THE DUE DATE.<br/><b>ALL BANK CHARGES ARE FOR SENDERS ACCOUNT</b>',small),Spacer(1,3*mm),Paragraph('<b><font color="red">FRAUD PREVENTION</font> // IF THE BANK DETAILS DO NOT MATCH THE ALREADY REGISTERED<br/>PLEASE CONTACT US IMMEDIATELY</b>',small)]
    return pdf(story,f'Sales Invoice {number}')


def range_text(line):
    if line.ordered_qty_min == line.ordered_qty_max:
        return f'{line.ordered_qty_min:.3f} MT'
    return f'{line.ordered_qty_min:.3f} - {line.ordered_qty_max:.3f} MT'


def contract_pdf(order):
    sheet, body, small = styles()
    number=order_number(order)
    story=header('B3, 19/F, Tung Lee Commercial Building, 91-97 Jervois Street, Sheung Wan, Hong Kong','bunker@bondfuels.com',True)
    title=ParagraphStyle('ContractTitle',parent=sheet['Heading1'],fontName='Helvetica-Bold',fontSize=17,alignment=TA_CENTER,spaceAfter=8)
    right=ParagraphStyle('Right',parent=body,alignment=TA_RIGHT)
    story += [Paragraph('BUNKER CONFIRMATION',title),Paragraph(f'Ref: {value(number)}<br/>Date: {day(order.order_date,True)}',right),Spacer(1,4*mm),
              Paragraph('Following your orders and further our telecom, we confirm having arranged the following bunkers.',body),Spacer(1,3*mm),Paragraph('<b>Vessel Information</b>',sheet['Heading3'])]
    eta=''
    if order.estimated_start_date and order.estimated_end_date:
        eta=f'{day(order.estimated_start_date)} - {day(order.estimated_end_date)}'
    vessel=Table([[Paragraph(f'<b>{k}</b>',body),Paragraph(value(v),body)] for k,v in [('Vessel:',order.vessel),('IMO:',order.imo),('Port:',order.port),('ETA:',eta),('Buyer:',order.customer),('Seller:',COMPANY),('Supplier:',order.supplier)]],colWidths=[24*mm,153*mm])
    vessel.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
    rows=[[Paragraph('<b>Product Name</b>',body),Paragraph('<b>Quantity</b>',body),Paragraph('<b>Price / Unit</b>',body),Paragraph('<b>Amount</b>',body)]]
    minimum=maximum=Decimal('0')
    for line in order.lines.all():
        low=rounded_money(line.ordered_qty_min*line.sale_price); high=rounded_money(line.ordered_qty_max*line.sale_price); minimum+=low; maximum+=high
        amount=money(low) if low==high else f'{money(low)} - {money(high)}'
        rows.append([Paragraph(value(line.oil),body),range_text(line),f'{money(line.sale_price)} / MT',amount])
    total=money(minimum) if minimum==maximum else f'{money(minimum)} - {money(maximum)}'
    rows.append([Paragraph('<b>Total</b>',body),'','',Paragraph(f'<b>{value(total)}</b>',body)])
    products=Table(rows,colWidths=[53*mm,40*mm,45*mm,39*mm],repeatRows=1)
    products.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.5,colors.HexColor('#30343a')),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#edf1f4')),('BACKGROUND',(0,-1),(-1,-1),colors.HexColor('#edf1f4')),('ALIGN',(1,0),(-1,-1),'RIGHT'),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    fees=[(name,amount) for name,amount in [('Customer bank fee',order.customer_fee),('Barge fee',order.berth_fee),('Exceptional fee',order.exceptional_fee)] if amount]
    additional='<br/>'.join(f'{value(name)}: {money(amount)}' for name,amount in fees)
    payment=value(order.customer_term_description)
    terms='<br/>'.join(f'{index}. {value(term)}' for index,term in enumerate(SALES_TERMS,1))
    story += [vessel,Spacer(1,3*mm),products,Spacer(1,3*mm),Paragraph('<b>Additional Cost</b>',sheet['Heading3']),Paragraph(additional,body),Spacer(1,2*mm),Paragraph('<b>Payment</b>',sheet['Heading3']),Paragraph(payment,body),Spacer(1,2*mm),Paragraph('<b>Terms of Sale</b>',sheet['Heading3']),Paragraph(terms,body),Spacer(1,5*mm),KeepTogether([Paragraph('<b>Please confirm stem in order.</b>',body),Spacer(1,4*mm),Paragraph('<b>Best Regards,</b>',body),Spacer(1,4*mm),Paragraph(f'<b>{COMPANY}</b>',body)]),Spacer(1,4*mm),Paragraph('Customer reference: &nbsp; · &nbsp; Payment instruction: BY ELECTRONIC FUND TRANSFER',small)]
    return pdf(story,f'Bunker Confirmation {number}')
