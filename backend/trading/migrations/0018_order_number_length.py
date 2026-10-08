from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('trading', '0017_account_bank_details')]

    operations = [
        migrations.AlterField(
            model_name='order',
            name='number',
            field=models.CharField(editable=False, max_length=20, unique=True),
        ),
    ]
