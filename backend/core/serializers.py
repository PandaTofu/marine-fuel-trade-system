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
        fields = '__all__'
        read_only_fields = ['updated_at']


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        exclude = ['id']
