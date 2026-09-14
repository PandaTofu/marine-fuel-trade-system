"""Handwritten migration for stages 2–3; not executed by the developer."""
import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name='WriteLock', fields=[
            ('id', models.PositiveSmallIntegerField(default=1, primary_key=True, serialize=False)),
        ]),
        migrations.CreateModel(name='Account', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('name', models.CharField(max_length=120, unique=True)),
            ('currency', models.CharField(default='CNY', max_length=3)),
            ('opening_balance', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
            ('is_default', models.BooleanField(default=False)),
            ('is_active', models.BooleanField(default=True)),
            ('note', models.CharField(blank=True, max_length=1000)),
            ('version', models.PositiveIntegerField(default=1)),
        ], options={'ordering': ['id'], 'constraints': [
            models.CheckConstraint(condition=models.Q(currency='CNY'), name='trading_account_cny'),
            models.CheckConstraint(condition=models.Q(opening_balance__gte=0), name='trading_opening_nonnegative'),
            models.UniqueConstraint(condition=models.Q(is_default=True), fields=('currency',), name='trading_default_currency'),
        ]}),
        migrations.CreateModel(name='Order', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('public_id', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
            ('order_date', models.DateField()),
            ('customer', models.CharField(max_length=160)),
            ('supplier', models.CharField(max_length=160)),
            ('vessel', models.CharField(max_length=160)),
            ('port', models.CharField(max_length=160)),
            ('imo', models.CharField(blank=True, max_length=40)),
            ('estimated_date', models.DateField(blank=True, null=True)),
            ('actual_date', models.DateField(blank=True, null=True)),
            ('customer_term', models.PositiveSmallIntegerField(default=0)),
            ('supplier_term', models.PositiveSmallIntegerField(default=0)),
            ('commission_rate', models.DecimalField(decimal_places=4, default=0, max_digits=12)),
            ('commission_recipient', models.CharField(blank=True, max_length=160)),
            ('salesperson', models.CharField(blank=True, max_length=160)),
            ('customer_fee', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
            ('supplier_fee', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
            ('berth_fee', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
            ('note', models.CharField(blank=True, max_length=2000)),
            ('currency', models.CharField(default='CNY', max_length=3)),
            ('state', models.CharField(choices=[('active','Active'),('void','Void'),('deleted','Deleted')], default='active', max_length=8)),
            ('version', models.PositiveIntegerField(default=1)),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('updated_at', models.DateTimeField(auto_now=True)),
        ], options={'ordering':['-order_date','-id'], 'constraints':[
            models.CheckConstraint(condition=models.Q(currency='CNY'), name='trading_order_cny'),
            models.CheckConstraint(condition=models.Q(customer_fee__gte=0,supplier_fee__gte=0,berth_fee__gte=0,commission_rate__gte=0), name='trading_order_fees_nonnegative'),
        ]}),
        migrations.CreateModel(name='OrderLine', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('position', models.PositiveSmallIntegerField()),
            ('oil', models.CharField(max_length=160)),
            ('ordered_qty', models.DecimalField(decimal_places=3,max_digits=12)),
            ('actual_qty', models.DecimalField(blank=True,null=True,decimal_places=3,max_digits=12)),
            ('sale_price', models.DecimalField(decimal_places=4,max_digits=12)),
            ('cost_price', models.DecimalField(decimal_places=4,max_digits=12)),
            ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='lines',to='trading.order')),
        ], options={'ordering':['position','id'],'constraints':[
            models.CheckConstraint(condition=models.Q(ordered_qty__gte=0,sale_price__gte=0,cost_price__gte=0) & (models.Q(actual_qty__isnull=True)|models.Q(actual_qty__gte=0)),name='trading_line_nonnegative'),
        ]}),
        migrations.CreateModel(name='Mutation', fields=[
            ('id', models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('key',models.UUIDField()),
            ('fingerprint',models.CharField(max_length=64)),
            ('result',models.JSONField(null=True)),
            ('created_at',models.DateTimeField(auto_now_add=True)),
            ('actor',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,to=settings.AUTH_USER_MODEL)),
        ],options={'constraints':[models.UniqueConstraint(fields=('actor','key'),name='trading_mutation_actor_key')]}),
        migrations.CreateModel(name='Entry',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('date',models.DateField()),
            ('direction',models.CharField(choices=[('income','Income'),('expense','Expense')],max_length=7)),
            ('category',models.CharField(choices=[('customer_receipt','Customer receipt'),('supplier_payment','Supplier payment'),('bank_fee','Bank fee'),('commission','Commission'),('berth','Berth expense'),('other_income','Other income'),('other_expense','Other expense')],max_length=24)),
            ('amount',models.DecimalField(decimal_places=2,max_digits=18)),
            ('component',models.CharField(blank=True,choices=[('customer_deposit','Customer deposit'),('customer_received','Customer receipts'),('supplier_deposit','Supplier deposit'),('supplier_paid','Supplier payments')],max_length=24)),
            ('settlement_delta',models.DecimalField(decimal_places=2,default=0,max_digits=18)),
            ('source',models.CharField(choices=[('settlement','Settlement'),('manual','Manual'),('correction','Correction'),('refund','Refund'),('reversal','Reversal'),('void','Void')],max_length=12)),
            ('reason',models.CharField(blank=True,max_length=1000)),
            ('created_at',models.DateTimeField(auto_now_add=True)),
            ('account',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='entries',to='trading.account')),
            ('actor',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,to=settings.AUTH_USER_MODEL)),
            ('order',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='entries',to='trading.order')),
            ('reversal_of',models.OneToOneField(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='reversed_by',to='trading.entry')),
        ],options={'ordering':['-date','-id'],'constraints':[models.CheckConstraint(condition=models.Q(amount__gt=0),name='trading_entry_positive')]}),
        migrations.CreateModel(name='OrderRevision',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('version',models.PositiveIntegerField()),
            ('action',models.CharField(max_length=30)),
            ('reason',models.CharField(blank=True,max_length=1000)),
            ('snapshot',models.JSONField()),
            ('created_at',models.DateTimeField(auto_now_add=True)),
            ('actor',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,to=settings.AUTH_USER_MODEL)),
            ('order',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='revisions',to='trading.order')),
        ],options={'ordering':['-version'],'constraints':[models.UniqueConstraint(fields=('order','version'),name='trading_order_revision')]}),
    ]
