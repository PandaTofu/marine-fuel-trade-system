from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0006_reference_contact_and_bank_fields')]

    operations = [
        migrations.AddField(model_name='reference', name='oil_category', field=models.CharField(blank=True, max_length=80)),
        migrations.AddField(model_name='reference', name='specification', field=models.CharField(blank=True, max_length=160)),
        migrations.AddField(model_name='reference', name='unit', field=models.CharField(blank=True, default='', max_length=20)),
        migrations.AddField(model_name='reference', name='reference_sale_price', field=models.DecimalField(blank=True, decimal_places=4, max_digits=18, null=True)),
        migrations.AddField(model_name='reference', name='reference_cost_price', field=models.DecimalField(blank=True, decimal_places=4, max_digits=18, null=True)),
        migrations.AddField(model_name='reference', name='note', field=models.CharField(blank=True, max_length=1000)),
    ]
