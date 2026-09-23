from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
from django.utils import timezone

ZERO = Decimal('0.00')
COMPONENTS = ('customer_deposit', 'customer_received', 'supplier_deposit', 'supplier_paid')
FINANCIAL_ORDER_STATES = ('confirmed', 'supplied', 'completed')
EXCLUDED_ORDER_STATES = ('draft', 'void', 'deleted')


def money(value):
    return Decimal(value).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)


def text(value):
    return format(money(value), '.2f')


def totals(lines, commission_rate=0, customer_fee=0, supplier_fee=0, berth_fee=0, exceptional_fee=0):
    rows = list(lines)
    quantity = sum((line.actual_qty or Decimal(0) for line in rows), Decimal(0))
    sales = sum((money((line.actual_qty or 0) * line.sale_price) for line in rows), ZERO)
    cost = sum((money((line.actual_qty or 0) * line.cost_price) for line in rows), ZERO)
    commission = money(quantity * Decimal(commission_rate))
    return {'quantity': quantity, 'sales': sales, 'cost': cost, 'commission': commission,
            'profit': sales - cost - commission - Decimal(customer_fee) - Decimal(supplier_fee) - Decimal(berth_fee) - Decimal(exceptional_fee)}


def state(balance, received, due, actual_date, lifecycle='confirmed', today=None):
    if lifecycle in EXCLUDED_ORDER_STATES:
        return lifecycle
    if not actual_date:
        return 'pending'
    if balance == 0:
        return 'settled'
    if due < (today or timezone.localdate()):
        return 'overdue'
    return 'partial' if received > 0 else 'not_due'


def settlement_totals(entries):
    result = {key: ZERO for key in COMPONENTS}
    for entry in entries:
        if entry.component in result:
            result[entry.component] += entry.settlement_delta
    return result


def order_numbers(order, entries=None):
    result = totals(order.lines.all(), order.commission_rate, order.customer_fee, order.supplier_fee, order.berth_fee, order.exceptional_fee)
    paid = ({key: ZERO for key in COMPONENTS} if order.state in EXCLUDED_ORDER_STATES
            else settlement_totals(order.entries.all() if entries is None else entries))
    receivable = result['sales'] - paid['customer_deposit'] - paid['customer_received'] - order.customer_fee
    payable = result['cost'] - paid['supplier_deposit'] - paid['supplier_paid']
    # The supply date is day one of the agreed payment term.
    customer_due = order.actual_date + timedelta(days=max(order.customer_term - 1, 0)) if order.actual_date else None
    supplier_due = order.actual_date + timedelta(days=max(order.supplier_term - 1, 0)) if order.actual_date else None
    result.update(paid)
    result.update(receivable=receivable, payable=payable, customer_due=customer_due, supplier_due=supplier_due)
    result['customer_status'] = state(receivable, paid['customer_deposit'] + paid['customer_received'], customer_due, order.actual_date, order.state)
    result['supplier_status'] = state(payable, paid['supplier_deposit'] + paid['supplier_paid'], supplier_due, order.actual_date, order.state)
    # Pending delivery has estimated liabilities only, excluded from actual AR/AP summaries.
    if not order.actual_date or order.state not in FINANCIAL_ORDER_STATES:
        result['receivable'] = result['payable'] = ZERO
    return result
