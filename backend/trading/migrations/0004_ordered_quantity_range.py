from django.db import migrations, models
from django.db.models import F, Q


def copy_maximum(apps, schema_editor):
    OrderLine = apps.get_model('trading', 'OrderLine')
    OrderLine.objects.update(ordered_qty_max=F('ordered_qty_min'))


class Migration(migrations.Migration):
    dependencies = [('trading', '0003_usd_supply_range_exceptional_fee')]

    operations = [
        migrations.RemoveConstraint(model_name='orderline', name='trading_line_nonnegative'),
        migrations.RenameField(model_name='orderline', old_name='ordered_qty', new_name='ordered_qty_min'),
        migrations.AddField(model_name='orderline', name='ordered_qty_max', field=models.DecimalField(decimal_places=3, max_digits=12, null=True)),
        migrations.RunPython(copy_maximum, migrations.RunPython.noop),
        migrations.AlterField(model_name='orderline', name='ordered_qty_max', field=models.DecimalField(decimal_places=3, max_digits=12)),
        migrations.AddConstraint(model_name='orderline', constraint=models.CheckConstraint(condition=Q(ordered_qty_min__gte=0, ordered_qty_max__gte=0, sale_price__gte=0, cost_price__gte=0) & (Q(actual_qty__isnull=True) | Q(actual_qty__gte=0)), name='trading_line_nonnegative')),
        migrations.AddConstraint(model_name='orderline', constraint=models.CheckConstraint(condition=Q(ordered_qty_min__lte=F('ordered_qty_max')), name='trading_ordered_qty_range')),
    ]
