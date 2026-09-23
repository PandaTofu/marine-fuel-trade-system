from decimal import Decimal, ROUND_HALF_UP
from django.db import migrations, models


def migrate_states(apps, schema_editor):
    Order = apps.get_model('trading', 'Order')
    Order.objects.filter(state='active', actual_date__isnull=True).update(state='confirmed')
    Order.objects.filter(state='active', actual_date__isnull=False).update(state='supplied')
    cent = Decimal('.01')
    for order in Order.objects.filter(state='supplied').prefetch_related('lines', 'entries'):
        sales = sum(
            (((line.actual_qty or 0) * line.sale_price).quantize(cent, rounding=ROUND_HALF_UP)
             for line in order.lines.all()),
            Decimal('0.00'),
        )
        cost = sum(
            (((line.actual_qty or 0) * line.cost_price).quantize(cent, rounding=ROUND_HALF_UP)
             for line in order.lines.all()),
            Decimal('0.00'),
        )
        paid = {'customer_deposit': Decimal(0), 'customer_received': Decimal(0),
                'supplier_deposit': Decimal(0), 'supplier_paid': Decimal(0)}
        for entry in order.entries.all():
            if entry.component in paid:
                paid[entry.component] += entry.settlement_delta
        receivable = sales - paid['customer_deposit'] - paid['customer_received'] - order.customer_fee
        payable = cost - paid['supplier_deposit'] - paid['supplier_paid']
        if receivable == 0 and payable == 0:
            Order.objects.filter(pk=order.pk).update(state='completed')


class Migration(migrations.Migration):
    dependencies = [('trading', '0008_single_default_account')]

    operations = [
        migrations.AlterField(
            model_name='order',
            name='state',
            field=models.CharField(
                choices=[('draft', 'Draft'), ('confirmed', 'Confirmed'), ('supplied', 'Supplied'), ('completed', 'Completed'), ('void', 'Void'), ('deleted', 'Deleted')],
                default='confirmed',
                max_length=12,
            ),
        ),
        migrations.RunPython(migrate_states, migrations.RunPython.noop),
    ]
