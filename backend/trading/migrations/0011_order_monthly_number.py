from django.db import migrations, models


def assign_monthly_numbers(apps, schema_editor):
    Order = apps.get_model('trading', 'Order')
    sequences = {}
    for order in Order.objects.order_by('order_date', 'id').iterator():
        prefix = order.order_date.strftime('%Y%m')
        sequences[prefix] = sequences.get(prefix, 0) + 1
        order.number = f'{prefix}-{sequences[prefix]:03d}'
        order.save(update_fields=['number'])


class Migration(migrations.Migration):
    dependencies = [('trading', '0010_order_document')]

    operations = [
        migrations.AddField(
            model_name='order',
            name='number',
            field=models.CharField(editable=False, max_length=10, null=True),
        ),
        migrations.RunPython(assign_monthly_numbers, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='order',
            name='number',
            field=models.CharField(editable=False, max_length=10, unique=True),
        ),
    ]
