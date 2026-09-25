from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0005_finance_role')]

    operations = [
        migrations.AddField(model_name='reference', name='email', field=models.EmailField(blank=True, max_length=254)),
        migrations.AddField(model_name='reference', name='swift_code', field=models.CharField(blank=True, max_length=40)),
        migrations.AddField(model_name='reference', name='iban', field=models.CharField(blank=True, max_length=80)),
        migrations.AddField(model_name='reference', name='bank_code', field=models.CharField(blank=True, max_length=40)),
        migrations.AddField(model_name='reference', name='bank_address', field=models.CharField(blank=True, max_length=300)),
    ]
