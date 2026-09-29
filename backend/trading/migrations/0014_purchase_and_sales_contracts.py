from django.db import migrations, models


def rename_contract(apps, schema_editor):
    OrderDocument = apps.get_model('trading', 'OrderDocument')
    OrderDocument.objects.filter(kind='contract').update(kind='sales_contract')


def restore_contract(apps, schema_editor):
    OrderDocument = apps.get_model('trading', 'OrderDocument')
    OrderDocument.objects.filter(kind='sales_contract').update(kind='contract')
    OrderDocument.objects.filter(kind='purchase_contract').delete()


class Migration(migrations.Migration):
    dependencies = [('trading', '0013_document_email')]

    operations = [
        migrations.AlterField(
            model_name='orderdocument',
            name='kind',
            field=models.CharField(
                choices=[
                    ('purchase_contract', 'Purchase contract'),
                    ('sales_contract', 'Sales contract'),
                    ('invoice', 'Invoice'),
                ],
                max_length=20,
            ),
        ),
        migrations.RunPython(rename_contract, restore_contract),
    ]
