import django.db.models.deletion
import trading.models
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('trading', '0015_orderpurgebackup'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='OrderAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('supplier_invoice', 'Supplier invoice'), ('bdn', 'BDN')], max_length=24)),
                ('file', models.FileField(max_length=300, upload_to=trading.models.order_attachment_path)),
                ('original_name', models.CharField(max_length=255)),
                ('uploaded_at', models.DateTimeField(auto_now=True)),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='trading.order')),
                ('uploaded_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['kind'],
                'constraints': [models.UniqueConstraint(fields=('order', 'kind'), name='trading_order_attachment_kind')],
            },
        ),
    ]
