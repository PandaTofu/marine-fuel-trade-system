from datetime import date, timedelta
from decimal import Decimal
from django.http import HttpResponse
from django.db.models import Q
from django.utils import timezone
from core.models import Audit
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Account, Order, Entry, OrderDocument
from .serializers import OrderSerializer, EntrySerializer, SettlementSerializer, EntryInput, RefundInput, ReasonInput, DocumentContentInput
from .services import command, save_order, save_account, delete_account, account_data, account_balance, locked_order, settle, refund, manual_entry, reverse_entry, close_order, require_admin, BusinessError
from .calculations import FINANCIAL_ORDER_STATES, EXCLUDED_ORDER_STATES, text, ZERO
from .exports import workbook
from .documents import invoice_pdf, contract_pdf, document_defaults


def validated(serializer_class, data):
    serializer = serializer_class(data=data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def filtered_dates(queryset, params, field):
    for key, lookup in [('date_from', 'gte'), ('date_to', 'lte')]:
        if params.get(key):
            try:
                value = date.fromisoformat(params[key])
            except ValueError:
                raise BusinessError('invalid')
            queryset = queryset.filter(**{f'{field}__{lookup}': value})
    return queryset


def page(rows, params):
    try:
        number = max(1, int(params.get('page', 1)))
        size = min(200, max(1, int(params.get('page_size', 20))))
    except (TypeError, ValueError):
        raise BusinessError('invalid')
    count = len(rows)
    return {'count': count, 'results': rows[(number-1)*size:number*size]}


def order_rows(params):
    qs = Order.objects.exclude(state='deleted').prefetch_related('lines', 'entries')
    qs = filtered_dates(qs, params, 'order_date')
    for field in ['customer', 'supplier', 'port', 'salesperson']:
        if params.get(field):
            qs = qs.filter(**{f'{field}__icontains': params[field]})
    if params.get('oil'):
        qs = qs.filter(lines__oil__icontains=params['oil']).distinct()
    if params.get('q'):
        q = params['q']
        qs = qs.filter(Q(vessel__icontains=q) | Q(customer__icontains=q) | Q(supplier__icontains=q))
    if params.get('state'):
        if params['state'] == 'financial':
            qs = qs.filter(state__in=FINANCIAL_ORDER_STATES)
        else:
            qs = qs.filter(state=params['state'])
    rows = list(OrderSerializer(qs, many=True).data)
    for side in ['customer', 'supplier']:
        value = params.get(f'{side}_status')
        if value:
            rows = [row for row in rows if row['numbers'][f'{side}_status'] == value]
    scope = params.get('settlement_scope')
    if scope == 'overdue':
        rows = [row for row in rows if 'overdue' in [row['numbers']['customer_status'],row['numbers']['supplier_status']]]
    elif scope == 'settled':
        rows = [row for row in rows if row['numbers']['customer_status'] == row['numbers']['supplier_status'] == 'settled']
    elif scope == 'partial':
        rows = [row for row in rows if row['state'] in FINANCIAL_ORDER_STATES and row['actual_date'] and any(Decimal(row['numbers'][balance]) > 0 and sum(Decimal(row['numbers'][key]) for key in keys) > 0 for balance, keys in [('receivable', ['customer_deposit','customer_received']), ('payable',['supplier_deposit','supplier_paid'])])]
    return rows


def summary(rows):
    active = [row for row in rows if row['state'] in FINANCIAL_ORDER_STATES]
    supplied = [row for row in active if row['state'] in ('supplied', 'completed') and row['actual_date']]
    amounts = {key: text(sum((Decimal(row['numbers'][key]) for row in supplied), ZERO)) for key in ['sales','cost','commission','profit','receivable','payable']}
    amounts.update({key: text(sum((Decimal(row[key]) for row in supplied), ZERO)) for key in ['customer_fee','supplier_fee','berth_fee','exceptional_fee']})
    amounts['order_count'] = len(active)
    for side, key in [('customer','receivable'),('supplier','payable')]:
        amounts[f'{key}_count'] = sum(Decimal(row['numbers'][key]) > 0 for row in supplied)
        amounts[f'{side}_overdue'] = text(sum((Decimal(row['numbers'][key]) for row in supplied if row['numbers'][f'{side}_status'] == 'overdue'),ZERO))
    amounts['partial_receipts'] = sum(Decimal(row['numbers']['receivable']) > 0 and Decimal(row['numbers']['customer_deposit'])+Decimal(row['numbers']['customer_received']) > 0 for row in supplied)
    amounts['net_expected'] = text(Decimal(amounts['receivable'])-Decimal(amounts['payable']))
    return amounts


@api_view(['GET','POST'])
def orders(request):
    if request.method == 'POST':
        return Response(command(request, 'order.create', lambda: save_order(request.user, request.data)), status=201)
    rows = order_rows(request.query_params)
    return Response({**page(rows, request.query_params), 'summary':summary(rows)})


@api_view(['GET','PATCH'])
def order_detail(request, pk):
    if request.method == 'PATCH':
        return Response(command(request, f'order.update.{pk}', lambda: save_order(request.user, request.data, pk)))
    try:
        row = Order.objects.exclude(state='deleted').prefetch_related('lines','entries').get(pk=pk)
    except Order.DoesNotExist:
        raise BusinessError('not_found',404)
    return Response(OrderSerializer(row).data)


@api_view(['GET'])
def order_document(request, pk, kind):
    try:
        row = Order.objects.exclude(state='deleted').prefetch_related('lines', 'entries').get(pk=pk)
    except Order.DoesNotExist:
        raise BusinessError('not_found', 404)
    saved = OrderDocument.objects.filter(order=row, kind=kind).first()
    document_content = saved.content if saved else None
    content = invoice_pdf(row, document_content) if kind == 'invoice' else contract_pdf(row, document_content)
    response = HttpResponse(content, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{kind}_{row.order_date:%Y%m%d}_{row.pk:06d}.pdf"'
    return response


@api_view(['GET', 'PUT'])
def order_document_content(request, pk, kind):
    if kind not in ('invoice', 'contract'):
        raise BusinessError('not_found', 404)
    try:
        row = Order.objects.exclude(state='deleted').prefetch_related('lines', 'entries').get(pk=pk)
    except Order.DoesNotExist:
        raise BusinessError('not_found', 404)
    saved = OrderDocument.objects.filter(order=row, kind=kind).first()
    if request.method == 'GET':
        return Response({
            'kind': kind,
            'content': saved.content if saved else document_defaults(row, kind),
            'updated_at': saved.updated_at.isoformat() if saved else None,
            'updated_by': saved.updated_by.username if saved else None,
        })
    content = validated(DocumentContentInput, request.data)['content']
    saved, _ = OrderDocument.objects.update_or_create(
        order=row, kind=kind,
        defaults={'content': content, 'updated_by': request.user},
    )
    Audit.objects.create(actor=request.user, action=f'{kind}_updated', target=str(row.pk))
    return Response({'kind': kind, 'content': saved.content, 'updated_at': saved.updated_at.isoformat(), 'updated_by': request.user.username})


@api_view(['POST'])
def settlement(request, pk):
    return Response(command(request, f'order.settlement.{pk}', lambda: settle(locked_order(pk), request.user, validated(SettlementSerializer, request.data))))


@api_view(['POST'])
def order_refund(request, pk):
    return Response(command(request, f'order.refund.{pk}', lambda: refund(locked_order(pk), request.user, validated(RefundInput, request.data))))


@api_view(['POST'])
def order_close(request, pk, action):
    def perform():
        data = validated(ReasonInput, request.data)
        return close_order(locked_order(pk), request.user, data.get('version'), data['reason'], void=action=='void', date=data['date'])
    return Response(command(request, f'order.{action}.{pk}', perform))


@api_view(['POST'])
def bulk_delete(request):
    def perform():
        require_admin(request.user)
        reason = validated(ReasonInput, request.data)['reason']
        records = request.data.get('orders')
        if not isinstance(records, list) or not records or len(records)>1000:
            raise BusinessError('invalid')
        seen = set()
        for item in records:
            if not isinstance(item, dict) or type(item.get('id')) is not int or item['id'] in seen:
                raise BusinessError('invalid')
            seen.add(item['id'])
        if request.data.get('clear_all'):
            if request.data.get('confirmation') != 'CLEAR' or seen != set(Order.objects.filter(state__in=[*FINANCIAL_ORDER_STATES, 'draft']).values_list('id',flat=True)):
                raise BusinessError('clear_snapshot_changed',409)
        for item in sorted(records,key=lambda item:item['id']):
            close_order(locked_order(item['id']), request.user, item.get('version'), reason)
        return {'ok':True, 'count':len(records)}
    return Response(command(request, 'order.bulk_delete', perform))


@api_view(['GET'])
def order_history(request, pk):
    try:
        row = Order.objects.get(pk=pk)
    except Order.DoesNotExist:
        raise BusinessError('not_found',404)
    return Response([{'version':rev.version,'action':rev.action,'reason':rev.reason,'actor':rev.actor.username,'created_at':rev.created_at.isoformat(),'snapshot':rev.snapshot} for rev in row.revisions.select_related('actor').all()])


@api_view(['GET'])
def options(request):
    qs = Order.objects.filter(state__in=FINANCIAL_ORDER_STATES)
    if request.query_params.get('q'):
        q=request.query_params['q']
        qs=qs.filter(Q(vessel__icontains=q)|Q(customer__icontains=q))
    return Response([{'id':o.pk,'version':o.version,'label':f'BO-{o.order_date:%Y%m%d}-{o.pk:06d} · {o.vessel} · {o.customer}'} for o in qs[:100]])


@api_view(['GET'])
def clear_snapshot(request):
    require_admin(request.user)
    rows=list(Order.objects.filter(state__in=[*FINANCIAL_ORDER_STATES, 'draft']).values('id','version'))
    return Response(rows)


@api_view(['GET','POST'])
def accounts(request):
    if request.method == 'POST':
        return Response(command(request, 'account.create', lambda: save_account(request.user, request.data)),status=201)
    rows=[account_data(row) for row in Account.objects.prefetch_related('entries__order')]
    totals = {}
    for row in rows:
        totals[row['currency']] = totals.get(row['currency'], ZERO) + Decimal(row['balance'])
    for row in rows:
        currency_total = totals[row['currency']]
        row['share']=text(Decimal(row['balance'])/currency_total*100) if currency_total>0 else None
    return Response({'results':rows,'totals_by_currency':{key:text(value) for key,value in totals.items()},'total_balance':text(totals.get('USD', ZERO)),'count':len(rows)})


@api_view(['PATCH','POST'])
def account_detail(request, pk):
    if request.method=='PATCH':
        return Response(command(request,f'account.update.{pk}',lambda:save_account(request.user,request.data,pk,request.data.get('version'))))
    return Response(command(request,f'account.delete.{pk}',lambda:delete_account(request.user,pk,request.data.get('version'))))


def ledger_rows(params):
    qs=Entry.objects.select_related('account','order','actor','reversed_by').all()
    qs=filtered_dates(qs,params,'date')
    for key in ['direction','category','source']:
        if params.get(key):
            qs=qs.filter(**{key:params[key]})
    for key in ['account','order']:
        if params.get(key):
            try:
                value=int(params[key])
            except (ValueError,TypeError):
                raise BusinessError('invalid')
            qs=qs.filter(**{f'{key}_id':value})
    return list(qs)


def effective_ledger_rows(rows):
    return [row for row in rows if not row.order_id or row.order.state not in EXCLUDED_ORDER_STATES]


@api_view(['GET','POST'])
def ledger(request):
    if request.method=='POST':
        return Response(command(request,'ledger.create',lambda:manual_entry(request.user,validated(EntryInput,request.data))),status=201)
    rows=ledger_rows(request.query_params)
    calculated = effective_ledger_rows(rows)
    income=sum((row.amount for row in calculated if row.direction=='income'),ZERO)
    expense=sum((row.amount for row in calculated if row.direction=='expense'),ZERO)
    return Response({**page(list(EntrySerializer(rows,many=True).data),request.query_params),'income':text(income),'expense':text(expense),'net':text(income-expense)})


@api_view(['POST'])
def ledger_reverse(request, pk):
    return Response(command(request,f'ledger.reverse.{pk}',lambda:reverse_entry(request.user,pk,validated(ReasonInput,request.data))))


@api_view(['GET'])
def dashboard(request):
    rows=order_rows({})
    result=summary(rows)
    month=timezone.localdate().strftime('%Y-%m')
    monthly=summary([row for row in rows if row['order_date'].startswith(month)])
    result.update(month_order_count=monthly['order_count'],month_profit=monthly['profit'])
    result['total_balance']=text(sum((account_balance(account) for account in Account.objects.filter(currency='USD').prefetch_related('entries__order')),ZERO))
    result['account_count']=Account.objects.count()
    result['overdue']=[row for row in rows if 'overdue' in [row['numbers']['customer_status'],row['numbers']['supplier_status']]]
    return Response(result)


@api_view(['GET'])
def forecast(request):
    try:
        cutoff = date.fromisoformat(request.query_params.get('cutoff', '')) if request.query_params.get('cutoff') else timezone.localdate() + timedelta(days=30)
    except ValueError:
        raise BusinessError('invalid')
    today = timezone.localdate()
    rows = []
    for order in order_rows({}):
        if order['state'] not in ('supplied', 'completed') or not order['actual_date']:
            continue
        if request.query_params.get('customer') and request.query_params['customer'].lower() not in order['customer'].lower():
            continue
        if request.query_params.get('supplier') and request.query_params['supplier'].lower() not in order['supplier'].lower():
            continue
        if request.query_params.get('oil') and not any(request.query_params['oil'].lower() in line['oil'].lower() for line in order['lines']):
            continue
        for side, amount_key, due_key, party_key in [('customer', 'receivable', 'customer_due', 'customer'), ('supplier', 'payable', 'supplier_due', 'supplier')]:
            amount = Decimal(order['numbers'][amount_key])
            due_text = order['numbers'][due_key]
            if amount <= 0 or not due_text:
                continue
            expected = date.fromisoformat(due_text)
            overdue = expected < today
            scope = request.query_params.get('scope')
            if scope == 'overdue' and not overdue:
                continue
            if scope == 'not_due' and overdue:
                continue
            if expected > cutoff:
                continue
            rows.append({'key': f"{order['id']}:{side}", 'order_id': order['id'], 'number': order['number'], 'side': side,
                         'counterparty': order[party_key], 'vessel': order['vessel'], 'oils': ' / '.join(line['oil'] for line in order['lines']),
                         'amount': text(amount), 'due_date': due_text, 'expected_date': due_text, 'status': 'overdue' if overdue else 'not_due'})
    current = sum((account_balance(account) for account in Account.objects.filter(currency='USD').prefetch_related('entries__order')), ZERO)
    return Response({'cutoff': cutoff.isoformat(), 'current_balance': text(current), 'results': rows})


@api_view(['GET'])
def ledger_export(request):
    rows=ledger_rows(request.query_params)
    english=request.query_params.get('language')=='en'
    headers=['Date','Account','Direction','Category','Amount (USD)','Order','Component','Source','Notes','Operator'] if english else ['日期','账户','收支方向','分类','金额（美元）','订单','结算项目','来源','备注','操作人']
    labels={'income':'收入','expense':'支出','customer_receipt':'客户收款','supplier_payment':'供应商付款','bank_fee':'银行手续费','commission':'佣金','berth':'泊位费','other_income':'其他收入','other_expense':'其他支出','settlement':'订单收付款','manual':'手工登记','correction':'录错更正','refund':'实际退款','reversal':'冲销','void':'作废冲销','customer_deposit':'客户订金','customer_received':'客户后续收款','supplier_deposit':'供应商订金','supplier_paid':'供应商后续付款'}
    translate=lambda value:value.replace('_',' ').title() if english else labels.get(value,value)
    details=[headers]+[[row.date.isoformat(),row.account.name,translate(row.direction),translate(row.category),row.amount,f'BO-{row.order.order_date:%Y%m%d}-{row.order_id:06d}' if row.order else '',translate(row.component),translate(row.source),row.reason,row.actor.username] for row in rows]
    calculated=effective_ledger_rows(rows)
    income=sum((row.amount for row in calculated if row.direction=='income'),ZERO)
    expense=sum((row.amount for row in calculated if row.direction=='expense'),ZERO)
    totals=[['Metric' if english else '指标','USD'],['Income' if english else '期间收入',income],['Expense' if english else '期间支出',expense],['Net' if english else '期间净额',income-expense]]
    totals += [[key,value] for key,value in request.query_params.items() if key!='language']
    response=HttpResponse(workbook([('Ledger' if english else '资金流水',details),('Summary' if english else '汇总',totals)]),content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition']=f'attachment; filename="ledger_{timezone.localdate().isoformat()}.xlsx"'
    return response
