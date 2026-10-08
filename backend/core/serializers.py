from decimal import Decimal
from rest_framework import serializers
from .models import User, Reference, Company


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'role', 'language', 'is_active', 'must_change_password']
        read_only_fields = ['must_change_password']


class ReferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reference
        fields = [
            'id', 'kind', 'code', 'name', 'email', 'swift_code', 'iban', 'bank_code', 'bank_address',
            'oil_category', 'specification', 'unit', 'reference_sale_price', 'reference_cost_price', 'note',
            'is_active', 'updated_at',
        ]
        read_only_fields = ['code', 'updated_at']
        extra_kwargs = {
            'reference_sale_price': {'min_value': Decimal('0')},
            'reference_cost_price': {'min_value': Decimal('0')},
        }

    def validate(self, attrs):
        kind = attrs.get('kind', getattr(self.instance, 'kind', None))
        if kind not in ('customer', 'supplier'):
            for field in ['email', 'swift_code', 'iban', 'bank_code', 'bank_address']:
                attrs[field] = ''
        if kind == 'oil':
            attrs['unit'] = attrs.get('unit', getattr(self.instance, 'unit', '')) or 'MT'
        else:
            for field in ['oil_category', 'specification', 'unit', 'note']:
                attrs[field] = ''
            for field in ['reference_sale_price', 'reference_cost_price']:
                attrs[field] = None
        return attrs


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        exclude = ['id']
