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
        fields = ['id', 'kind', 'code', 'name', 'email', 'swift_code', 'iban', 'bank_code', 'bank_address', 'is_active', 'updated_at']
        read_only_fields = ['code', 'updated_at']

    def validate(self, attrs):
        kind = attrs.get('kind', getattr(self.instance, 'kind', None))
        if kind not in ('customer', 'supplier'):
            for field in ['email', 'swift_code', 'iban', 'bank_code', 'bank_address']:
                attrs[field] = ''
        return attrs


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        exclude = ['id']
