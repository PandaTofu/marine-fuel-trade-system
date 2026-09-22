from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0002_alter_company_name_alter_company_name_en')]

    operations = [
        migrations.RemoveField(model_name='reference', name='contact'),
        migrations.RemoveField(model_name='reference', name='name_en'),
        migrations.RemoveField(model_name='reference', name='note'),
        migrations.AlterField(
            model_name='reference',
            name='code',
            field=models.CharField(blank=True, editable=False, max_length=40, null=True),
        ),
        migrations.AddConstraint(
            model_name='reference',
            constraint=models.UniqueConstraint(fields=('kind', 'name'), name='reference_kind_name'),
        ),
    ]
