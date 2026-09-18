import uuid
from django.conf import settings
from django.db import models


class WriteLock(models.Model):
    """Short database lock for financial writes in this <=10-user application."""
    id = models.PositiveSmallIntegerField(primary_key=True, default=1)


class Mutation(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    key = models.UUIDField()
    fingerprint = models.CharField(max_length=64)
    result = models.JSONField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['actor', 'key'], name='trading_mutation_actor_key')]


class Account(models.Model):
    name = models.CharField(max_length=120, unique=True)
    currency = models.CharField(max_length=3, default='USD')
    opening_balance = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    note = models.CharField(max_length=1000, blank=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['id']
        constraints = [
            models.CheckConstraint(condition=models.Q(currency='USD'), name='trading_account_usd'),
            models.CheckConstraint(condition=models.Q(opening_balance__gte=0), name='trading_opening_nonnegative'),
            models.UniqueConstraint(fields=['currency'], condition=models.Q(is_default=True), name='trading_default_currency'),
        ]


class Order(models.Model):
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    order_date = models.DateField()
    customer = models.CharField(max_length=160)
    supplier = models.CharField(max_length=160)
    vessel = models.CharField(max_length=160)
    port = models.CharField(max_length=160)
    imo = models.CharField(max_length=40, blank=True)
    estimated_start_date = models.DateField(null=True, blank=True)
    estimated_end_date = models.DateField(null=True, blank=True)
    actual_date = models.DateField(null=True, blank=True)
    customer_term_description = models.CharField(max_length=160, blank=True)
    customer_term = models.PositiveSmallIntegerField(default=0)
    supplier_term_description = models.CharField(max_length=160, blank=True)
    supplier_term = models.PositiveSmallIntegerField(default=0)
    commission_rate = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    commission_recipient = models.CharField(max_length=160, blank=True)
    salesperson = models.CharField(max_length=160, blank=True)
    customer_fee = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    supplier_fee = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    berth_fee = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    exceptional_fee = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    note = models.CharField(max_length=2000, blank=True)
    currency = models.CharField(max_length=3, default='USD')
    state = models.CharField(max_length=8, default='active', choices=[('active', 'Active'), ('void', 'Void'), ('deleted', 'Deleted')])
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-order_date', '-id']
        constraints = [
            models.CheckConstraint(condition=models.Q(currency='USD'), name='trading_order_usd'),
            models.CheckConstraint(condition=models.Q(customer_fee__gte=0, supplier_fee__gte=0, berth_fee__gte=0, exceptional_fee__gte=0, commission_rate__gte=0), name='trading_order_fees_nonnegative'),
        ]


class OrderLine(models.Model):
    order = models.ForeignKey(Order, related_name='lines', on_delete=models.CASCADE)
    position = models.PositiveSmallIntegerField()
    oil = models.CharField(max_length=160)
    ordered_qty_min = models.DecimalField(max_digits=12, decimal_places=3)
    ordered_qty_max = models.DecimalField(max_digits=12, decimal_places=3)
    actual_qty = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    sale_price = models.DecimalField(max_digits=12, decimal_places=4)
    cost_price = models.DecimalField(max_digits=12, decimal_places=4)

    class Meta:
        ordering = ['position', 'id']
        constraints = [
            models.CheckConstraint(condition=models.Q(ordered_qty_min__gte=0, ordered_qty_max__gte=0, sale_price__gte=0, cost_price__gte=0) & (models.Q(actual_qty__isnull=True) | models.Q(actual_qty__gte=0)), name='trading_line_nonnegative'),
            models.CheckConstraint(condition=models.Q(ordered_qty_min__lte=models.F('ordered_qty_max')), name='trading_ordered_qty_range'),
        ]


class Entry(models.Model):
    COMPONENTS = [('customer_deposit', 'Customer deposit'), ('customer_received', 'Customer receipts'), ('supplier_deposit', 'Supplier deposit'), ('supplier_paid', 'Supplier payments')]
    CATEGORIES = [('customer_receipt', 'Customer receipt'), ('supplier_payment', 'Supplier payment'), ('bank_fee', 'Bank fee'), ('commission', 'Commission'), ('berth', 'Berth expense'), ('other_income', 'Other income'), ('other_expense', 'Other expense')]
    account = models.ForeignKey(Account, related_name='entries', on_delete=models.PROTECT)
    order = models.ForeignKey(Order, related_name='entries', null=True, blank=True, on_delete=models.PROTECT)
    date = models.DateField()
    direction = models.CharField(max_length=7, choices=[('income', 'Income'), ('expense', 'Expense')])
    category = models.CharField(max_length=24, choices=CATEGORIES)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    component = models.CharField(max_length=24, choices=COMPONENTS, blank=True)
    settlement_delta = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    source = models.CharField(max_length=12, choices=[('settlement', 'Settlement'), ('manual', 'Manual'), ('correction', 'Correction'), ('refund', 'Refund'), ('reversal', 'Reversal'), ('void', 'Void')])
    reason = models.CharField(max_length=1000, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    reversal_of = models.OneToOneField('self', related_name='reversed_by', null=True, blank=True, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name='trading_entry_positive')]


class OrderRevision(models.Model):
    order = models.ForeignKey(Order, related_name='revisions', on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    version = models.PositiveIntegerField()
    action = models.CharField(max_length=30)
    reason = models.CharField(max_length=1000, blank=True)
    snapshot = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-version']
        constraints = [models.UniqueConstraint(fields=['order', 'version'], name='trading_order_revision')]
