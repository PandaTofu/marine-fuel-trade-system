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
PURCHASE_TERMS = (
    'The seller warrants that the bunkers delivered under this contract do not contain chemical waste, waste lubricating oil of any kind or other substances detrimental to vessel, her engine(s) and/or her crew.',
    'Fuel Oil to be in conformity with MARPOL 73/78, ANNEX VI regulations, particularly regulations 14(1) and 18(1), Appendix V and Resolution MEPC 96 (47) Guidelines for the Sampling of Fuel Oil to be in compliance with ANNEX VI of MARPOL 73/78. Certificate of Origin is compliant with all US, EU or any other sanctions and you so warrant accordingly.',
    'Physical Supplier shall not allow a no-lien or disclaimer stamp of any type or form on the BDN without prior written approval from Bond Shipping and Trading Limited. If you are not Physical Supplier, you shall ensure that the Physical Supplier is so instructed.',
    'Notice for quality claims within 30 days from delivery.',
    'Please forward invoices to accounts@bond-shipping.com. Original BDN shall be available upon request.',
)
SALES_TERMS = (
    'Delivery always subject to weather conditions.',
    "Overtime / Extra charges, if any, are for Buyers' account.",
    "Please ensure the Master or vessel's representative witnesses the drawing of the official representative samples of each fuel supplied, receives and retains a sealed container of each sample, and witnesses the soundings and measurements before and after delivery.",
    'Kindly inform the vessel to tender 72/48/24/12 hours notice to the local bunker supplier or barge coordinator together with final bunker quantity. If the vessel cannot fulfil the given ETA, price is subject to change and supply is on a best endeavours basis.',
    'The agent shall coordinate with the local supplier for a prompt and smooth supply.',
    'Payment shall be made by T.T. remittance in full, free and clear of any deduction, offset or counterclaim in U.S. Dollars on or before the due date to our designated bank.',
    'If the Buyers wish to appoint a surveyor, they must notify the supplier at the time of stem at the latest in order to receive the Supplier\'s consent for that surveyor; otherwise the surveyor will not be accepted.',
    'Any delay in payment and/or refund shall entitle either party to interest at the rate of two (2) percent per month or any part thereof.',
    "If the buyer has overdue payments on the delivery date or the seller has reasonable concerns regarding the buyer's payment capability, the seller reserves the right of non-performance.",
    'Any dispute as to the quantity delivered must be noted at the time of delivery in the receipt or in the letter of protest. Any claim as to short delivery shall be presented by the Buyers in writing within seven (7) days from the date of delivery, failing which the claim shall be deemed waived and barred.',
    "Any claim as to the quality or description of the Marine Fuels must be notified in writing promptly after the circumstances giving rise to the claim have been discovered. If the Buyers do not notify the Sellers within fourteen (14) days of delivery, the claim shall be deemed waived and barred.",
    "This contract is made subject to Bond Shipping and Trading Limited general terms and conditions and the seller's nominated physical bunker supplier's terms and conditions.",
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
    if kind in ('purchase_contract', 'sales_contract'):
        purchase = kind == 'purchase_contract'
        suffix = 'PC' if purchase else 'SC'
        price_field = 'cost_price' if purchase else 'sale_price'
        minimum = sum((rounded_money(line.ordered_qty_min * getattr(line, price_field)) for line in order.lines.all()), Decimal('0'))
        maximum = sum((rounded_money(line.ordered_qty_max * getattr(line, price_field)) for line in order.lines.all()), Decimal('0'))
        total = money(minimum) if minimum == maximum else f'{money(minimum)} - {money(maximum)}'
        products = []
        for line in order.lines.all():
            price = getattr(line, price_field)
            amount = money(rounded_money(line.ordered_qty_min * price)) if line.ordered_qty_min == line.ordered_qty_max else f'{money(rounded_money(line.ordered_qty_min * price))} - {money(rounded_money(line.ordered_qty_max * price))}'
            specification = line.oil_reference.specification if line.oil_reference_id else ''
            quantity = f'{line.ordered_qty_min:,.3f}' if line.ordered_qty_min == line.ordered_qty_max else f'{line.ordered_qty_min:,.3f} - {line.ordered_qty_max:,.3f}'
            products.append({'name': line.oil, 'specification': specification, 'quantity': quantity, 'unit_price': f'{rounded_money(price):,.2f}', 'amount': amount})
        costs = [
            ('Supplier payment fee' if purchase else 'Customer bank fee', order.supplier_fee if purchase else order.customer_fee),
            ('Barging Fee', order.berth_fee),
            ('Exceptional fee', order.exceptional_fee),
        ]
        return {
            'reference': f'{number}-{suffix}', 'date': day(order.order_date, True),
            'document_title': 'BUNKER NOMINATION' if purchase else 'SALES CONFIRMATION',
            'intro': 'Following your orders and further our telecom, we confirm having arranged the following bunkers.' if purchase else 'We hereby confirm the following Sales Order:',
            'vessel': order.vessel, 'imo': order.imo, 'port': order.port, 'eta': eta,
            'buyer': COMPANY if purchase else order.customer,
            'seller': order.supplier if purchase else COMPANY,
            'supplier': order.supplier, 'products': products, 'total': total,
            'additional_cost': '\n'.join(f'{name}: {money(amount)}' for name, amount in costs if amount),
            'payment': order.supplier_term_description if purchase else order.customer_term_description,
            'physical_supplier': order.supplier if purchase else '',
            'remarks': 'N/A',
            'terms': '\n'.join(PURCHASE_TERMS if purchase else SALES_TERMS),
            'closing': ('Please confirm stem in order.\n\nWe thank you for your support.\nTrading Department\n' if purchase else 'We thank you for your support.\n\nTrading Department\n') + COMPANY,
        }
    document_number = f'{number}-INV'
    products = [
        {'name': line.oil, 'quantity': f'{line.actual_qty:.3f}' if line.actual_qty is not None else '',
         'unit': 'MT' if line.actual_qty is not None else '',
         'unit_price': f'{rounded_money(line.sale_price):.2f}',
         'amount': f'{rounded_money((line.actual_qty or 0) * line.sale_price):.2f}' if line.actual_qty is not None else ''}
        for line in order.lines.all()
    ]
    if order.berth_fee:
        products.append({'name': 'Barging Fee', 'quantity': '1.000', 'unit': '', 'unit_price': f'{rounded_money(order.berth_fee):.2f}', 'amount': f'{rounded_money(order.berth_fee):.2f}'})
    return {
        'reference_number': document_number, 'invoice_number': document_number,
        'customer': order.customer, 'vessel': order.vessel, 'imo': order.imo,
        'customer_address': '',
        'port': order.port, 'invoice_date': day(timezone.localdate()),
        'delivery_date': day(order.actual_date), 'due_date': day(numbers['customer_due']),
        'customer_reference': '', 'products': products,
        'currency': 'USD', 'beneficiary_name': COMPANY.upper(),
        'beneficiary_address': COMPANY_ADDRESS, 'bank_name': 'DBS BANK (HONGKONG) LIMITED',
        'account_number': '002836028', 'swift': 'DHBKHKHH',
        'bank_address': "G/F, The Center, 99 Queen's Road Central, Central, Hong Kong",
        'remittance_reference': document_number,
        'payment_instructions': 'BY ELECTRONIC FUND TRANSFER', 'vat_rate': '0',
        'late_payment_terms': 'LATE PAYMENT WILL BE CHARGED WITH 2% INTEREST MONTHLY PRORATED FROM THE DUE DATE.',
        'bank_charge_terms': 'ALL BANK CHARGES ARE FOR SENDERS ACCOUNT',
        'fraud_prevention': 'IF THE BANK DETAILS DO NOT MATCH THE ALREADY REGISTERED, PLEASE CONTACT US IMMEDIATELY.',
    }


def logo_path():
    return Path(settings.BASE_DIR).parent / 'frontend' / 'public' / 'assets' / 'company-logo.png'


def stamp_path():
    return Path(settings.BASE_DIR).parent / 'frontend' / 'public' / 'assets' / 'company-stamp.png'


def merge_document_content(defaults, saved=None):
    """Add fields introduced by newer templates without overwriting saved edits."""
    if not saved:
        return defaults
    merged = {**defaults, **saved}
    default_products = defaults.get('products', [])
    saved_products = saved.get('products')
    if isinstance(saved_products, list):
        merged['products'] = [
            {**(default_products[index] if index < len(default_products) else {}), **line}
            if isinstance(line, dict) else line
            for index, line in enumerate(saved_products)
        ]
    return merged


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
    data = merge_document_content(document_defaults(order, 'invoice'), content)
    number = data['reference_number']
    story = header(COMPANY_ADDRESS, COMPANY_EMAIL)
    story += [Paragraph('<u><b>SALES INVOICE</b></u>', sheet['Heading3']), Spacer(1, 5*mm),
              Paragraph('Master and Owners and /or Managing Owners and/or Operators and/or Charterers and /or Buyers', body),
              Paragraph(f'of <b>{value(data["vessel"])}</b> and:', body), Paragraph(f'<b>{value(data["customer"])}</b>', body),
              Paragraph(f'ADD: {value(data.get("customer_address"))}', body), Spacer(1, 3*mm)]
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
    try:
        vat_rate = Decimal(str(data.get('vat_rate') or '0'))
    except Exception:
        vat_rate = Decimal('0')
    vat = rounded_money(subtotal * vat_rate / Decimal('100'))
    total = subtotal + vat
    totals=Table([['SUBTOTAL',money(subtotal)],[f'VAT AT {vat_rate:g} %',money(vat)],['TOTAL AMOUNT',money(total)]],colWidths=[140*mm,37*mm])
    totals.setStyle(TableStyle([('ALIGN',(1,0),(-1,-1),'RIGHT'),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTNAME',(0,2),(-1,2),'Helvetica-Bold'),('LINEABOVE',(0,0),(-1,0),.6,colors.black),('LINEBELOW',(0,2),(-1,2),.6,colors.black)]))
    story += [Spacer(1,2*mm),totals,Spacer(1,3*mm)]
    bank=[('PAYMENT INSTRUCTIONS',data.get('payment_instructions')),('CURRENCY',data['currency']),('BENEFICIARY NAME',data['beneficiary_name']),
          ('BENEFICIARY ADDRESS',data['beneficiary_address']), ('BANK NAME',data['bank_name']),
          ('ACCOUNT NR / IBAN NR',data['account_number']),('SWIFT',data['swift']),
          ('BANK ADDRESS',data['bank_address']),('REMITTANCE REFERENCE',data['remittance_reference'])]
    bank_table=Table([[Paragraph(value(k),small),Paragraph(f'<b>{value(v)}</b>',small)] for k,v in bank],colWidths=[43*mm,134*mm])
    bank_table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),1),('TOPPADDING',(0,0),(-1,-1),1),('BOTTOMPADDING',(0,0),(-1,-1),1)]))
    stamp = Image(str(stamp_path()), width=24*mm, height=18*mm, kind='proportional') if stamp_path().exists() else ''
    notices = [
        Paragraph(value(data.get('late_payment_terms')), small),
        Paragraph(f'<b>{value(data.get("bank_charge_terms"))}</b>', small),
        Spacer(1, 2*mm),
        Paragraph(f'<b><font color="red">FRAUD PREVENTION</font> // {value(data.get("fraud_prevention"))}</b>', small),
    ]
    notice_table = Table([[notices, stamp]], colWidths=[145*mm, 32*mm])
    notice_table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'BOTTOM'),('ALIGN',(1,0),(1,0),'RIGHT'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0)]))
    story += [bank_table,Spacer(1,2*mm),notice_table]
    return pdf(story,f'Sales Invoice {number}')


def range_text(line):
    if line.ordered_qty_min == line.ordered_qty_max:
        return f'{line.ordered_qty_min:.3f} MT'
    return f'{line.ordered_qty_min:.3f} - {line.ordered_qty_max:.3f} MT'


def contract_pdf(order, content=None, kind='sales_contract'):
    sheet, body, small = styles()
    data = merge_document_content(document_defaults(order, kind), content)
    purchase = kind == 'purchase_contract'
    number=data['reference']
    story=header(COMPANY_ADDRESS, COMPANY_EMAIL)
    title=ParagraphStyle('ContractTitle',parent=sheet['Heading1'],fontName='Helvetica-Bold',fontSize=17,alignment=TA_CENTER,spaceAfter=8)
    right=ParagraphStyle('Right',parent=body,alignment=TA_RIGHT)
    story += [Paragraph(value(data['document_title']),title),Paragraph(f'Ref: {value(number)}<br/>Date: {value(data["date"])}',right),Spacer(1,4*mm),
              Paragraph(value(data['intro']),body),Spacer(1,3*mm),Paragraph('<b>Vessel Information</b>',sheet['Heading3'])]
    vessel_rows=[('Vessel:',data['vessel']),('IMO:',data['imo']),('Port:',data['port']),('ETA Range:',data['eta']),('Buyer:',data['buyer']),('Seller:',data['seller']),('Payment Term:',data['payment']),('Additional cost:',data['additional_cost'] or 'N/A')]
    if purchase:
        vessel_rows.append(('Physical supplier:', data.get('physical_supplier', '')))
    vessel=Table([[Paragraph(f'<b>{k}</b>',body),Paragraph(value(v),body)] for k,v in vessel_rows],colWidths=[30*mm,147*mm])
    vessel.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
    rows=[[Paragraph('<b>Grade</b>',body),Paragraph('<b>Spec</b>',body),Paragraph('<b>Quantity (MT)</b>',body),Paragraph('<b>Unit Price (USD/MT)</b>',body)]]
    for line in data['products']:
        rows.append([Paragraph(value(line.get('name')),body),Paragraph(value(line.get('specification')),body),value(line.get('quantity')),value(line.get('unit_price'))])
    products=Table(rows,colWidths=[38*mm,68*mm,34*mm,37*mm],repeatRows=1)
    products.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.5,colors.HexColor('#30343a')),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#edf1f4')),('ALIGN',(2,0),(-1,-1),'RIGHT'),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    terms='<br/><br/>'.join(value(term) for term in str(data['terms']).splitlines() if term.strip())
    closing='<br/>'.join(value(line) for line in str(data['closing']).splitlines())
    terms_title = 'Terms of Purchase' if purchase else 'Terms of Sale'
    stamp = Image(str(stamp_path()), width=28*mm, height=25*mm, kind='proportional') if stamp_path().exists() else ''
    closing_table = Table([[Paragraph(f'<b>{closing}</b>',body), stamp]], colWidths=[142*mm,35*mm])
    closing_table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'BOTTOM'),('ALIGN',(1,0),(1,0),'RIGHT'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0)]))
    story += [vessel,Spacer(1,3*mm),products,Spacer(1,3*mm),Paragraph('<b>Kindly inform us immediately if there are any errors, omissions or changes to the above.</b>',body),Spacer(1,2*mm),Paragraph(f'<b>{"Remarks" if purchase else "Other remarks"}:</b> {value(data.get("remarks") or "N/A")}',body),Spacer(1,2*mm),Paragraph(f'<b>{terms_title}</b>',sheet['Heading3']),Paragraph(terms,body),Spacer(1,5*mm),KeepTogether([closing_table])]
    return pdf(story,f'{data["document_title"]} {number}')
