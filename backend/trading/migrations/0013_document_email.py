import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('trading', '0012_order_daily_number'),
    ]

    operations = [
        migrations.CreateModel(
            name='DocumentEmail',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('request_id', models.UUIDField(unique=True)),
                ('recipients', models.JSONField(default=list)),
                ('cc', models.JSONField(default=list)),
                ('subject', models.CharField(max_length=300)),
                ('body', models.TextField(max_length=20000)),
                ('attachment_name', models.CharField(max_length=180)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('sent', 'Sent'), ('failed', 'Failed')], default='pending', max_length=12)),
                ('error', models.CharField(blank=True, max_length=1000)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('document', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='emails', to='trading.orderdocument')),
                ('sent_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at', '-id']},
        ),
    ]
