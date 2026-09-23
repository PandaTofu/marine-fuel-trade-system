from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    role = models.CharField(max_length=12, choices=[('admin', 'Admin'), ('operator', 'Operator'), ('finance', 'Finance')], default='operator')
    language = models.CharField(max_length=8, choices=[('zh-CN', '中文'), ('en', 'English')], default='zh-CN')
    must_change_password = models.BooleanField(default=True)
    session_version = models.PositiveIntegerField(default=0)


class LoginGuard(models.Model):
    key = models.CharField(max_length=64, unique=True)
    failures = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True)


class Reference(models.Model):
    KINDS = [('customer', 'Customer'), ('supplier', 'Supplier'), ('oil', 'Oil'), ('port', 'Port'), ('salesperson', 'Salesperson')]
    kind = models.CharField(max_length=16, choices=KINDS)
    code = models.CharField(max_length=40, null=True, blank=True, editable=False)
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']
        constraints = [
            models.UniqueConstraint(fields=['kind', 'code'], name='reference_kind_code'),
            models.UniqueConstraint(fields=['kind', 'name'], name='reference_kind_name'),
        ]

    def assign_code(self):
        prefixes = {'customer': 'CUS', 'supplier': 'SUP', 'oil': 'OIL', 'port': 'POR', 'salesperson': 'SAL'}
        self.code = f"{prefixes[self.kind]}-{self.pk:06d}"
        self.save(update_fields=['code'])


class Company(models.Model):
    name = models.CharField(max_length=160, blank=True, default='Bond Shipping and Trading Limited')
    name_en = models.CharField(max_length=160, blank=True, default='Bond Shipping and Trading Limited')
    address = models.CharField(max_length=300, blank=True, default='ROOM E18, NO.107, 1/F, BLK A, HANGWAI IND CTR, NO.6, KIN TAI ST, TUEN MUN, N.T., HONG KONG')
    address_en = models.CharField(max_length=300, blank=True, default='ROOM E18, NO.107, 1/F, BLK A, HANGWAI IND CTR, NO.6, KIN TAI ST, TUEN MUN, N.T., HONG KONG')
    email = models.EmailField(blank=True, default='bunker@bond-shipping.com')
    phone = models.CharField(max_length=60, blank=True)
    invoice_prefix = models.CharField(max_length=12, default='BD')


class Audit(models.Model):
    actor = models.ForeignKey(User, on_delete=models.PROTECT, null=True)
    action = models.CharField(max_length=60)
    target = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
