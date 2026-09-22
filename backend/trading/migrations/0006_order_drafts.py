from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [('trading', '0005_reference_links')]

    operations = [
        migrations.AlterField(
            model_name='order', name='state',
            field=models.CharField(choices=[('draft', 'Draft'), ('active', 'Active'), ('void', 'Void'), ('deleted', 'Deleted')], default='active', max_length=8),
        ),
    ]
