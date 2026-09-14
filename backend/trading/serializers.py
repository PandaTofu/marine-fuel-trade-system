from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers
from .models import Order, OrderLine, Account, Entry
from .calculations import order_numbers, text


class LineSerializer(serializers.ModelSerializer):
    sale_amount = serializers.SerializerMethodField()
    cost_amount = serializers.SerializerMethodField()

    class Meta:
        model = OrderLine
        fields = ['id', 'oil', 'ordered_qty', 'actual_qty', 'sale_price', 'cost_price', 'sale_amount', 'cost_amount']
        extra_kwargs = {key: {'min_value': Decimal(0)} for key in ['ordered_qty', 'actual_qty', 'sale_price', 'cost_price']}

    def get_sale_amount(self, row):
        return text((row.actual_qty or 0) * row.sale_price)

    def get_cost_amount(self, row):
        return text((row.actual_qty or 0) * row.cost_price)


class OrderSerializer(serializers.ModelSerializer):
    customer_deposit = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=0, required=False, write_only=True)
    customer_received = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=0, required=False, write_only=True)
    supplier_deposit = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=0, required=False, write_only=True)
    supplier_paid = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=0, required=False, write_only=True)
    lines = LineSerializer(many=True)
    numbers = serializers.SerializerMethodField()
    number = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ['id', 'number', 'public_id', 'order_date', 'customer', 'supplier', 'vessel', 'port', 'imo', 'estimated_start_date', 'estimated_end_date', 'actual_date', 'customer_term_description', 'customer_term', 'supplier_term_description', 'supplier_term', 'commission_rate', 'commission_recipient', 'salesperson', 'customer_fee', 'supplier_fee', 'berth_fee', 'exceptional_fee', 'customer_deposit', 'customer_received', 'supplier_deposit', 'supplier_paid', 'note', 'currency', 'state', 'version', 'lines', 'numbers', 'updated_at']
        read_only_fields = ['state', 'version', 'public_id', 'updated_at']
        extra_kwargs = {key: {'min_value': Decimal(0)} for key in ['commission_rate', 'customer_fee', 'supplier_fee', 'berth_fee', 'exceptional_fee']}

    def get_numbers(self, row):
        return {key: text(value) if isinstance(value, Decimal) and key != 'quantity' else format(value, '.3f') if isinstance(value, Decimal) else value.isoformat() if hasattr(value, 'isoformat') else value for key, value in order_numbers(row).items()}

    def get_number(self, row):
        return f'BO-{row.order_date:%Y%m%d}-{row.pk:06d}'

    def validate(self, attrs):
        actual = attrs.get('actual_date', getattr(self.instance, 'actual_date', None))
        currency = attrs.get('currency', getattr(self.instance, 'currency', 'USD'))
        if currency != 'USD':
            raise serializers.ValidationError({'currency': 'usd_only'})
        estimated_start = attrs.get('estimated_start_date', getattr(self.instance, 'estimated_start_date', None))
        estimated_end = attrs.get('estimated_end_date', getattr(self.instance, 'estimated_end_date', None))
        if bool(estimated_start) != bool(estimated_end):
            raise serializers.ValidationError({'estimated_start_date': 'estimated_range_required', 'estimated_end_date': 'estimated_range_required'})
        if estimated_start and estimated_end and estimated_start > estimated_end:
            raise serializers.ValidationError({'estimated_end_date': 'estimated_range_order'})
        if actual and actual > timezone.localdate():
            raise serializers.ValidationError({'actual_date': 'future_date'})
        lines = attrs.get('lines')
        if lines is not None and (not lines or len(lines) > 100):
            raise serializers.ValidationError({'lines': 'one_to_100_lines'})
        rows = lines if lines is not None else [{'actual_qty': line.actual_qty} for line in self.instance.lines.all()] if self.instance else []
        if actual:
            if any(row.get('actual_qty') is None for row in rows) or sum(row['actual_qty'] for row in rows) <= 0:
                raise serializers.ValidationError({'lines': 'actual_quantity_required'})
        elif any(row.get('actual_qty') is not None for row in rows):
            raise serializers.ValidationError({'actual_date': 'required_with_actual_quantity'})
        return attrs


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = '__all__'
        read_only_fields = ['version']
        extra_kwargs = {'opening_balance': {'min_value': Decimal(0)}}
        # Conditional uniqueness is maintained atomically when changing the default.
        validators = []

    def validate_currency(self, value):
        if value != 'USD':
            raise serializers.ValidationError('usd_only')
        return value


class SettlementSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)
    account_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    date = serializers.DateField(default=timezone.localdate)
    reason = serializers.CharField(max_length=1000, required=False, allow_blank=True, default='')
    customer_deposit = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=0, required=False)
    customer_received = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=0, required=False)
    supplier_deposit = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=0, required=False)
    supplier_paid = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=0, required=False)
    customer_fee = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=0, required=False)
    supplier_fee = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=0, required=False)
    berth_fee = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=0, required=False)
    exceptional_fee = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=0, required=False)

    def validate_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError('future_date')
        return value


class EntryInput(serializers.Serializer):
    account_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    order_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    version = serializers.IntegerField(min_value=1, required=False)
    date = serializers.DateField(default=timezone.localdate)
    direction = serializers.ChoiceField(choices=['income', 'expense'])
    category = serializers.ChoiceField(choices=Entry.CATEGORIES)
    component = serializers.ChoiceField(choices=Entry.COMPONENTS, required=False, allow_blank=True, default='')
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal('.01'))
    reason = serializers.CharField(max_length=1000, allow_blank=True, required=False, default='')

    def validate_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError('future_date')
        return value


class RefundInput(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)
    component = serializers.ChoiceField(choices=Entry.COMPONENTS)
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal('.01'))
    date = serializers.DateField(default=timezone.localdate)
    reason = serializers.CharField(max_length=1000, allow_blank=False)

    def validate_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError('future_date')
        return value


class ReasonInput(serializers.Serializer):
    version = serializers.IntegerField(min_value=1, required=False)
    reason = serializers.CharField(max_length=1000, allow_blank=False)
    date = serializers.DateField(default=timezone.localdate)

    def validate_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError('future_date')
        return value


class EntrySerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source='account.name', read_only=True)
    actor_name = serializers.CharField(source='actor.username', read_only=True)
    order_number = serializers.SerializerMethodField()
    reversed = serializers.SerializerMethodField()

    class Meta:
        model = Entry
        fields = ['id', 'account', 'account_name', 'order', 'order_number', 'date', 'direction', 'category', 'amount', 'component', 'settlement_delta', 'source', 'reason', 'actor_name', 'reversal_of', 'reversed', 'created_at']

    def get_order_number(self, row):
        return f'BO-{row.order.order_date:%Y%m%d}-{row.order_id:06d}' if row.order_id else ''

    def get_reversed(self, row):
        return hasattr(row, 'reversed_by')
