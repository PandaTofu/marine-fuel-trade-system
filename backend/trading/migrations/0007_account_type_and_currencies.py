from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('trading', '0006_order_drafts')]

    operations = [
        migrations.RemoveConstraint(
            model_name='account',
            name='trading_account_usd',
        ),
        migrations.AddField(
            model_name='account',
            name='account_type',
            field=models.CharField(
                choices=[('bank', 'Bank account'), ('cash', 'Cash'), ('other', 'Other')],
                default='bank',
                max_length=12,
            ),
        ),
        migrations.AlterField(
            model_name='account',
            name='currency',
            field=models.CharField(
                choices=[('USD', 'USD'), ('CNY', 'CNY'), ('HKD', 'HKD'), ('SGD', 'SGD'), ('EUR', 'EUR')],
                default='USD',
                max_length=3,
            ),
        ),
    ]
