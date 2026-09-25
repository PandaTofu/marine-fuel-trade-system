from collections import defaultdict

from django.db import migrations, models


def assign_daily_numbers(apps, schema_editor):
    Order = apps.get_model('trading', 'Order')
    OrderDocument = apps.get_model('trading', 'OrderDocument')
    sequences = defaultdict(int)
    orders = list(Order.objects.order_by('order_date', 'id'))
    for order in orders:
        Order.objects.filter(pk=order.pk).update(number=f'T{order.pk:012d}')
    for order in orders:
        prefix = order.order_date.strftime('SO%Y%m%d')
        sequences[prefix] += 1
        number = f'{prefix}{sequences[prefix]:03d}'
        Order.objects.filter(pk=order.pk).update(number=number)
        for document in OrderDocument.objects.filter(order_id=order.pk):
            content = dict(document.content or {})
            if document.kind == 'contract':
                content['reference'] = f'{number}-CON'
            else:
                content.update({
                    'reference_number': f'{number}-INV',
                    'invoice_number': f'{number}-INV',
                    'remittance_reference': f'{number}-INV',
                })
            OrderDocument.objects.filter(pk=document.pk).update(content=content)


class Migration(migrations.Migration):
    dependencies = [('trading', '0011_order_monthly_number')]

    operations = [
        migrations.AlterField(
            model_name='order',
            name='number',
            field=models.CharField(editable=False, max_length=13, unique=True),
        ),
        migrations.RunPython(assign_daily_numbers, migrations.RunPython.noop),
    ]
