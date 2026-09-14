from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    role = models.CharField(max_length=12, choices=[('admin', 'Admin'), ('operator', 'Operator')], default='operator')
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
    code = models.CharField(max_length=40)
    name = models.CharField(max_length=120)
    name_en = models.CharField(max_length=160, blank=True)
    contact = models.CharField(max_length=160, blank=True)
    note = models.CharField(max_length=1000, blank=True)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']
        constraints = [models.UniqueConstraint(fields=['kind', 'code'], name='reference_kind_code')]


class Company(models.Model):
    name = models.CharField(max_length=160, blank=True, default='船只进销系统')
    name_en = models.CharField(max_length=160, blank=True, default='Vessel Trade Management')
    address = models.CharField(max_length=300, blank=True)
    address_en = models.CharField(max_length=300, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=60, blank=True)
    invoice_prefix = models.CharField(max_length=12, default='BD')


class Audit(models.Model):
    actor = models.ForeignKey(User, on_delete=models.PROTECT, null=True)
    action = models.CharField(max_length=60)
    target = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
