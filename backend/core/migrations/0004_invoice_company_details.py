from django.db import migrations, models


COMPANY_NAME = 'Bond Shipping and Trading Limited'
COMPANY_ADDRESS = 'ROOM E18, NO.107, 1/F, BLK A, HANGWAI IND CTR, NO.6, KIN TAI ST, TUEN MUN, N.T., HONG KONG'
COMPANY_EMAIL = 'bunker@bond-shipping.com'


def set_company_details(apps, schema_editor):
    Company = apps.get_model('core', 'Company')
    Company.objects.update_or_create(
        pk=1,
        defaults={
            'name': COMPANY_NAME,
            'name_en': COMPANY_NAME,
            'address': COMPANY_ADDRESS,
            'address_en': COMPANY_ADDRESS,
            'email': COMPANY_EMAIL,
            'phone': '',
            'invoice_prefix': 'BD',
        },
    )


class Migration(migrations.Migration):
    dependencies = [('core', '0003_simplify_reference')]

    operations = [
        migrations.AlterField(model_name='company', name='name', field=models.CharField(blank=True, default=COMPANY_NAME, max_length=160)),
        migrations.AlterField(model_name='company', name='name_en', field=models.CharField(blank=True, default=COMPANY_NAME, max_length=160)),
        migrations.AlterField(model_name='company', name='address', field=models.CharField(blank=True, default=COMPANY_ADDRESS, max_length=300)),
        migrations.AlterField(model_name='company', name='address_en', field=models.CharField(blank=True, default=COMPANY_ADDRESS, max_length=300)),
        migrations.AlterField(model_name='company', name='email', field=models.EmailField(blank=True, default=COMPANY_EMAIL, max_length=254)),
        migrations.RunPython(set_company_details, migrations.RunPython.noop),
    ]
