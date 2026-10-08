from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('trading', '0016_orderattachment')]

    operations = [
        migrations.AddField(model_name='account', name='beneficiary_name', field=models.CharField(blank=True, max_length=160)),
        migrations.AddField(model_name='account', name='bank_account_number', field=models.CharField(blank=True, max_length=100)),
        migrations.AddField(model_name='account', name='bank_name', field=models.CharField(blank=True, max_length=160)),
        migrations.AddField(model_name='account', name='branch_name', field=models.CharField(blank=True, max_length=160)),
        migrations.AddField(model_name='account', name='bank_address', field=models.CharField(blank=True, max_length=300)),
        migrations.AddField(model_name='account', name='swift_code', field=models.CharField(blank=True, max_length=40)),
        migrations.AddField(model_name='account', name='iban', field=models.CharField(blank=True, max_length=80)),
        migrations.AddField(model_name='account', name='bank_code', field=models.CharField(blank=True, max_length=40)),
        migrations.AddField(model_name='account', name='bank_phone', field=models.CharField(blank=True, max_length=60)),
        migrations.AddField(model_name='account', name='opening_exchange_rate', field=models.DecimalField(decimal_places=6, default=Decimal('1'), max_digits=18)),
        migrations.AddConstraint(model_name='account', constraint=models.CheckConstraint(condition=models.Q(('opening_exchange_rate__gt', 0)), name='trading_exchange_rate_positive')),
    ]
