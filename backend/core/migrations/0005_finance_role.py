from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0004_invoice_company_details')]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[('admin', 'Admin'), ('operator', 'Operator'), ('finance', 'Finance')],
                default='operator',
                max_length=12,
            ),
        ),
    ]
