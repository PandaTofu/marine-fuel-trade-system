import django.db.models.deletion
from django.db import migrations, models


def link_unique_existing_names(apps, schema_editor):
    Reference = apps.get_model('core', 'Reference')
    Order = apps.get_model('trading', 'Order')
    OrderLine = apps.get_model('trading', 'OrderLine')

    targets = [
        ('customer', Order, 'customer', 'customer_reference_id'),
        ('supplier', Order, 'supplier', 'supplier_reference_id'),
        ('port', Order, 'port', 'port_reference_id'),
        ('salesperson', Order, 'salesperson', 'salesperson_reference_id'),
        ('oil', OrderLine, 'oil', 'oil_reference_id'),
    ]
    for kind, model, name_field, reference_field in targets:
        unique = {}
        ambiguous = set()
        for reference in Reference.objects.filter(kind=kind).only('id', 'name'):
            if reference.name in unique:
                ambiguous.add(reference.name)
            else:
                unique[reference.name] = reference.id
        for name in ambiguous:
            unique.pop(name, None)
        for name, reference_id in unique.items():
            model.objects.filter(**{name_field: name, f'{reference_field}__isnull': True}).update(**{reference_field: reference_id})


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_alter_company_name_alter_company_name_en'),
        ('trading', '0004_ordered_quantity_range'),
    ]

    operations = [
        migrations.AddField(
            model_name='order', name='customer_reference',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='customer_orders', to='core.reference'),
        ),
        migrations.AddField(
            model_name='order', name='port_reference',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='port_orders', to='core.reference'),
        ),
        migrations.AddField(
            model_name='order', name='salesperson_reference',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='salesperson_orders', to='core.reference'),
        ),
        migrations.AddField(
            model_name='order', name='supplier_reference',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='supplier_orders', to='core.reference'),
        ),
        migrations.AddField(
            model_name='orderline', name='oil_reference',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='order_lines', to='core.reference'),
        ),
        migrations.RunPython(link_unique_existing_names, migrations.RunPython.noop),
    ]
