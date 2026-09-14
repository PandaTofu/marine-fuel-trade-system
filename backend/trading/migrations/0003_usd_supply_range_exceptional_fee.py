from django.db import migrations, models
from django.db.models import Q


def use_usd(apps, schema_editor):
    apps.get_model('trading', 'Account').objects.update(currency='USD')
    apps.get_model('trading', 'Order').objects.update(currency='USD')


class Migration(migrations.Migration):
    dependencies = [('trading', '0002_order_term_descriptions')]

    operations = [
        migrations.RemoveConstraint(model_name='account', name='trading_account_cny'),
        migrations.RemoveConstraint(model_name='order', name='trading_order_cny'),
        migrations.RemoveConstraint(model_name='order', name='trading_order_fees_nonnegative'),
        migrations.RenameField(model_name='order', old_name='estimated_date', new_name='estimated_start_date'),
        migrations.AddField(model_name='order', name='estimated_end_date', field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name='order', name='exceptional_fee', field=models.DecimalField(decimal_places=2, default=0, max_digits=18)),
        migrations.AlterField(model_name='account', name='currency', field=models.CharField(default='USD', max_length=3)),
        migrations.AlterField(model_name='order', name='currency', field=models.CharField(default='USD', max_length=3)),
        migrations.RunPython(use_usd, migrations.RunPython.noop),
        migrations.AddConstraint(model_name='account', constraint=models.CheckConstraint(condition=Q(currency='USD'), name='trading_account_usd')),
        migrations.AddConstraint(model_name='order', constraint=models.CheckConstraint(condition=Q(currency='USD'), name='trading_order_usd')),
        migrations.AddConstraint(
            model_name='order',
            constraint=models.CheckConstraint(
                condition=Q(customer_fee__gte=0, supplier_fee__gte=0, berth_fee__gte=0, exceptional_fee__gte=0, commission_rate__gte=0),
                name='trading_order_fees_nonnegative',
            ),
        ),
    ]
