import hashlib
import json
import uuid
from decimal import Decimal
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import APIException
from core.models import Audit
from .models import Account, Order, OrderLine, Entry, OrderRevision, Mutation, WriteLock
from .calculations import COMPONENTS, ZERO, money, text, totals, settlement_totals
from .serializers import OrderSerializer, AccountSerializer


class BusinessError(APIException):
    def __init__(self, code, status=400):
        self.status_code = status
        self.default_code = code
        super().__init__(code, code=code)


def require_admin(actor):
    if actor.role != 'admin':
        raise BusinessError('permission_denied', 403)


def check_version(obj, version):
    if isinstance(version, bool) or str(version) != str(obj.version):
        raise BusinessError('version_conflict', 409)


def writable(order, version):
    check_version(order, version)
    if order.state != 'active':
        raise BusinessError('order_closed', 409)


def locked_order(pk):
    try:
        return Order.objects.select_for_update().get(pk=pk)
    except Order.DoesNotExist:
        raise BusinessError('not_found', 404)


def command(request, scope, operation):
    """Atomic, serialized financial write, with persisted replay response.

    Same actor + key + payload returns the original result, including after a
    response is lost. Failed transactions do not retain the mutation key.
    No network calls or document generation are performed while holding the lock.
    """
    try:
        key = uuid.UUID(str(request.data.get('request_id', '')))
    except (ValueError, TypeError, AttributeError):
        raise BusinessError('request_id_required')
    fingerprint = hashlib.sha256(json.dumps({'scope': scope, 'body': request.data}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    with transaction.atomic():
        WriteLock.objects.get_or_create(pk=1)
        WriteLock.objects.select_for_update().get(pk=1)
        record, _ = Mutation.objects.get_or_create(actor=request.user, key=key, defaults={'fingerprint': fingerprint})
        if record.fingerprint != fingerprint:
            raise BusinessError('idempotency_conflict', 409)
        if record.result is not None:
            return record.result
        result = operation()
        record.result = result
        record.save(update_fields=['result'])
        return result


def account_balance(account):
    return Decimal(account.opening_balance) + sum((entry.amount if entry.direction == 'income' else -entry.amount for entry in account.entries.all()), ZERO)


def account_data(account):
    result = dict(AccountSerializer(account).data)
    result['balance'] = text(account_balance(account))
    entries = list(account.entries.all())
    result['ledger_income'] = text(sum((entry.amount for entry in entries if entry.direction == 'income'), ZERO))
    result['ledger_expense'] = text(sum((entry.amount for entry in entries if entry.direction == 'expense'), ZERO))
    result['has_entries'] = account.entries.exists()
    return result


def choose_account(pk=None):
    account = Account.objects.filter(pk=pk).first() if pk else Account.objects.filter(is_default=True).first()
    if not account or not account.is_active or account.currency != 'USD':
        raise BusinessError('account_required')
    return account


def save_account(actor, data, pk=None, version=None):
    require_admin(actor)
    row = Account.objects.filter(pk=pk).first() if pk else None
    if pk and row is None:
        raise BusinessError('not_found', 404)
    if row:
        check_version(row, version)
    serializer = AccountSerializer(row, data=data, partial=row is not None)
    serializer.is_valid(raise_exception=True)
    values = serializer.validated_data
    if row and row.entries.exists() and values.get('opening_balance', row.opening_balance) != row.opening_balance:
        raise BusinessError('opening_locked')
    default = values.get('is_default', row.is_default if row else not Account.objects.exists())
    if row is None and not Account.objects.exists():
        default = True
    active = values.get('is_active', row.is_active if row else True)
    if default and not active:
        raise BusinessError('default_must_be_active')
    if default:
        Account.objects.filter(is_default=True).exclude(pk=pk).update(is_default=False, version=F('version') + 1)
    account = serializer.save(is_default=default, version=row.version + 1 if row else 1)
    Audit.objects.create(actor=actor, action='account_updated' if pk else 'account_created', target=str(account.pk))
    return account_data(account)


def delete_account(actor, pk, version):
    require_admin(actor)
    row = Account.objects.filter(pk=pk).first()
    if not row:
        raise BusinessError('not_found', 404)
    check_version(row, version)
    if row.entries.exists():
        raise BusinessError('account_has_entries')
    Audit.objects.create(actor=actor, action='account_deleted', target=str(row.pk))
    row.delete()
    return {'ok': True}


def validate_paid(order):
    paid = settlement_totals(order.entries.all())
    if any(value < 0 for value in paid.values()):
        raise BusinessError('negative_settlement')
    if order.actual_date:
        amounts = totals(order.lines.all())
        sales, cost = amounts['sales'], amounts['cost']
    else:
        # Deposits before supply are capped by the contracted ordered quantity.
        sales = sum((money(line.ordered_qty_max * line.sale_price) for line in order.lines.all()), ZERO)
        cost = sum((money(line.ordered_qty_max * line.cost_price) for line in order.lines.all()), ZERO)
        if paid['customer_received'] or paid['supplier_paid']:
            raise BusinessError('supply_required')
    if paid['customer_deposit'] + paid['customer_received'] + order.customer_fee > sales:
        raise BusinessError('over_receipt')
    if paid['supplier_deposit'] + paid['supplier_paid'] > cost:
        raise BusinessError('over_payment')


def revision(order, actor, action, reason='', bump=True):
    if bump:
        order.version += 1
        order.save(update_fields=['version', 'updated_at'])
    snapshot = dict(OrderSerializer(order).data)
    OrderRevision.objects.create(order=order, actor=actor, version=order.version, action=action, reason=reason, snapshot=snapshot)
    Audit.objects.create(actor=actor, action=f'order_{action}', target=str(order.pk))
    return snapshot


def save_order(actor, payload, pk=None):
    row = locked_order(pk) if pk else None
    if row:
        writable(row, payload.get('version'))
        if row.entries.exists() and not str(payload.get('reason', '')).strip():
            raise BusinessError('reason_required')
    if len(str(payload.get('reason', ''))) > 1000:
        raise BusinessError('invalid')
    serializer = OrderSerializer(row, data=payload, partial=row is not None)
    serializer.is_valid(raise_exception=True)
    values = dict(serializer.validated_data)
    lines = values.pop('lines', None)
    settlements = {key: values.pop(key) for key in COMPONENTS if key in values}
    if row is None:
        row = Order.objects.create(**values)
    else:
        for key, value in values.items():
            setattr(row, key, value)
        row.save()
    if lines is not None:
        row.lines.all().delete()
        OrderLine.objects.bulk_create([OrderLine(order=row, position=i, **line) for i, line in enumerate(lines)])
    if settlements:
        paid = settlement_totals(row.entries.all())
        target_account = choose_account() if any(settlements.get(key, paid[key]) > paid[key] for key in COMPONENTS) else None
        posting_date = row.order_date
        if posting_date > timezone.localdate() and any(settlements.get(key, paid[key]) != paid[key] for key in COMPONENTS):
            raise BusinessError('future_date')
        reason = str(payload.get('reason', ''))
        for key in COMPONENTS:
            delta = settlements.get(key, paid[key]) - paid[key]
            if delta:
                post_component(row, actor, key, delta, posting_date, target_account,
                               source='correction' if delta < 0 else 'settlement', reason=reason)
    validate_paid(row)
    return revision(row, actor, 'updated' if pk else 'created', str(payload.get('reason', '')), bump=bool(pk))


def post_component(order, actor, component, delta, date, account=None, source='settlement', reason=''):
    if delta == 0:
        return
    customer = component.startswith('customer')
    category = 'customer_receipt' if customer else 'supplier_payment'
    normal = 'income' if customer else 'expense'
    if delta > 0:
        Entry.objects.create(order=order, account=account or choose_account(), actor=actor, date=date, amount=delta, component=component, settlement_delta=delta, category=category, direction=normal, source=source, reason=reason)
        return
    if not reason.strip():
        raise BusinessError('reason_required')
    # Reduce the latest positive per-account balance first. Corrections never
    # silently go to a newly selected default account or erase the original entry.
    balances = {}
    for entry in order.entries.filter(component=component).order_by('id'):
        balance = balances.get(entry.account_id, ZERO) + entry.settlement_delta
        if entry.settlement_delta > 0:
            balances.pop(entry.account_id, None)
        balances[entry.account_id] = balance
    remaining = -delta
    for account_id, balance in reversed(list(balances.items())):
        amount = min(max(balance, ZERO), remaining)
        if amount:
            Entry.objects.create(order=order, account_id=account_id, actor=actor, date=date, amount=amount, component=component, settlement_delta=-amount, category=category, direction='expense' if customer else 'income', source=source, reason=reason)
            remaining -= amount
        if not remaining:
            break
    if remaining:
        raise BusinessError('refund_exceeds_paid')


def settle(order, actor, values):
    writable(order, values['version'])
    paid = settlement_totals(order.entries.all())
    changed = False
    reason = values.get('reason', '')
    target_account = None
    if any(values.get(key, paid[key]) > paid[key] for key in COMPONENTS):
        target_account = choose_account(values.get('account_id'))
    for key in COMPONENTS:
        delta = values.get(key, paid[key]) - paid[key]
        if delta:
            post_component(order, actor, key, delta, values['date'], target_account, source='correction' if delta < 0 else 'settlement', reason=reason)
            changed = True
    for key in ['customer_fee', 'supplier_fee', 'berth_fee', 'exceptional_fee']:
        if key in values and getattr(order, key) != values[key]:
            if values[key] < getattr(order, key) and not reason.strip():
                raise BusinessError('reason_required')
            setattr(order, key, values[key])
            changed = True
    order.save()
    validate_paid(order)
    return revision(order, actor, 'settlement', reason) if changed else dict(OrderSerializer(order).data)


def refund(order, actor, values):
    writable(order, values['version'])
    post_component(order, actor, values['component'], -values['amount'], values['date'], source='refund', reason=values['reason'])
    validate_paid(order)
    return revision(order, actor, 'refund', values['reason'])


def manual_entry(actor, values):
    account = choose_account(values.get('account_id'))
    order = locked_order(values['order_id']) if values.get('order_id') else None
    if order:
        writable(order, values.get('version'))
    category = values['category']
    direction = values['direction']
    expected = 'income' if category in ['customer_receipt', 'other_income'] else 'expense'
    if direction != expected:
        raise BusinessError('direction_mismatch')
    component = values.get('component', '')
    if order and category in ['customer_receipt', 'supplier_payment']:
        allowed = COMPONENTS[:2] if category == 'customer_receipt' else COMPONENTS[2:]
        if component not in allowed:
            raise BusinessError('component_required')
        post_component(order, actor, component, values['amount'], values['date'], account, source='settlement', reason=values['reason'])
        validate_paid(order)
    else:
        if component:
            raise BusinessError('component_not_allowed')
        Entry.objects.create(account=account, order=order, actor=actor, date=values['date'], direction=direction, category=category, amount=values['amount'], source='manual', reason=values['reason'])
    if order:
        revision(order, actor, 'entry', values['reason'])
    Audit.objects.create(actor=actor, action='ledger_created', target=str(order.pk) if order else str(account.pk))
    return {'ok': True}


def reverse_entry(actor, pk, values):
    require_admin(actor)
    try:
        entry = Entry.objects.select_related('order').get(pk=pk)
    except Entry.DoesNotExist:
        raise BusinessError('not_found', 404)
    if entry.source != 'manual' or entry.component or hasattr(entry, 'reversed_by'):
        raise BusinessError('linked_entry_protected')
    order = locked_order(entry.order_id) if entry.order_id else None
    if order:
        writable(order, values.get('version'))
    Entry.objects.create(account=entry.account, order=order, actor=actor, date=values['date'], direction='expense' if entry.direction == 'income' else 'income', category=entry.category, amount=entry.amount, source='reversal', reason=values['reason'], reversal_of=entry)
    if order:
        revision(order, actor, 'reversal', values['reason'])
    Audit.objects.create(actor=actor, action='ledger_reversed', target=str(pk))
    return {'ok': True}


def close_order(order, actor, version, reason, void=False, date=None):
    require_admin(actor)
    writable(order, version)
    if not reason.strip():
        raise BusinessError('reason_required')
    if not void and order.entries.exists():
        raise BusinessError('posted_order_protected')
    if void:
        # A void is a documented accounting correction, never an external payment.
        for entry in order.entries.filter(reversal_of__isnull=True, reversed_by__isnull=True).order_by('id'):
            Entry.objects.create(account=entry.account, order=order, actor=actor, date=date or timezone.localdate(), direction='expense' if entry.direction == 'income' else 'income', category=entry.category, amount=entry.amount, component=entry.component, settlement_delta=-entry.settlement_delta, source='void', reason=reason, reversal_of=entry)
    order.state = 'void' if void else 'deleted'
    order.save(update_fields=['state'])
    revision(order, actor, 'void' if void else 'deleted', reason)
    return {'ok': True}
