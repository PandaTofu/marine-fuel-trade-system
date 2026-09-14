from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('trading', '0001_initial')]
    operations = [
        migrations.AddField(
            model_name='order',
            name='customer_term_description',
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name='order',
            name='supplier_term_description',
            field=models.CharField(blank=True, max_length=160),
        ),
    ]
