import hashlib
from datetime import timedelta
from django.contrib.auth import login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as PasswordError
from django.db import transaction
from django.db.models import Q
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import api_view, permission_classes, authentication_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.viewsets import ModelViewSet
from .models import User, LoginGuard, Company, Reference, Audit
from .serializers import UserSerializer, ReferenceSerializer, CompanySerializer


def admin(request):
    if request.user.role != 'admin':
        raise PermissionDenied()


def audit(request, action_name, target):
    Audit.objects.create(actor=request.user, action=action_name, target=str(target))


def check_password(value, user):
    if not isinstance(value, str) or len(value) > 128:
        raise ValidationError({'password': ['invalid_password']})
    try:
        validate_password(value, user)
    except PasswordError:
        raise ValidationError({'password': ['password_policy']})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def csrf(request):
    return Response({'csrfToken': get_token(request)})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def sign_in(request):
    SessionAuthentication().enforce_csrf(request)
    username = str(request.data.get('username', '')).strip()[:150]
    raw = request.data.get('password', '')
    if not isinstance(raw, str) or len(raw) > 128:
        return Response({'code': 'invalid_credentials'}, status=400)
    key = hashlib.sha256(username.encode()).hexdigest()
    with transaction.atomic():
        LoginGuard.objects.get_or_create(key=key)
        guard = LoginGuard.objects.select_for_update().get(key=key)
        now = timezone.now()
        if guard.locked_until and guard.locked_until > now:
            return Response({'code': 'account_locked'}, status=429)
        if guard.locked_until:
            guard.failures = 0
            guard.locked_until = None
        user = User.objects.filter(username=username).first()
        valid = user.check_password(raw) if user else User().check_password(raw)
        if not user or not valid or not user.is_active:
            guard.failures += 1
            if guard.failures >= 5:
                guard.locked_until = now + timedelta(minutes=15)
            guard.save()
            return Response({'code': 'account_locked' if guard.locked_until else 'invalid_credentials'}, status=429 if guard.locked_until else 400)
        guard.failures = 0
        guard.locked_until = None
        guard.save()
        login(request._request, user)
        request.session['activity'] = now.timestamp()
        request.session['version'] = user.session_version
        return Response(UserSerializer(user).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sign_out(request):
    logout(request._request)
    return Response({'ok': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def password(request):
    current = request.data.get('current_password', '')
    if not isinstance(current, str) or not request.user.check_password(current):
        return Response({'code': 'invalid_credentials'}, status=400)
    new = request.data.get('password', '')
    check_password(new, request.user)
    if new == current:
        return Response({'code': 'password_unchanged'}, status=400)
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=request.user.pk)
        user.set_password(new)
        user.must_change_password = False
        user.session_version += 1
        user.save()
        update_session_auth_hash(request._request, user)
        request.session['version'] = user.session_version
        request.session['activity'] = timezone.now().timestamp()
        audit(request, 'password_changed', user.pk)
    return Response(UserSerializer(user).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def language(request):
    value = request.data.get('language')
    if value not in ['zh-CN', 'en']:
        raise ValidationError()
    User.objects.filter(pk=request.user.pk).update(language=value)
    return Response({'language': value})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def activity(request):
    request.session['activity'] = timezone.now().timestamp()
    return Response({'ok': True})


class Users(ModelViewSet):
    serializer_class = UserSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        admin(self.request)
        return User.objects.order_by('id')

    def create(self, request):
        admin(request)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        candidate = User(**serializer.validated_data)
        raw = request.data.get('password')
        check_password(raw, candidate)
        with transaction.atomic():
            user = serializer.save(must_change_password=True)
            user.set_password(raw)
            user.save()
            audit(request, 'user_created', user.pk)
        return Response(UserSerializer(user).data, status=201)

    def partial_update(self, request, *args, **kwargs):
        admin(request)
        with transaction.atomic():
            # Serialize administrator changes so two admins cannot remove each other.
            list(User.objects.select_for_update().filter(role='admin').order_by('id'))
            user = self.get_object()
            if user.pk == request.user.pk and (request.data.get('is_active') is False or request.data.get('role', user.role) != 'admin'):
                return Response({'code': 'self_admin_protected'}, status=400)
            serializer = self.get_serializer(user, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            changed = any(k in request.data and request.data[k] != getattr(user, k) for k in ['is_active', 'role'])
            serializer.save(session_version=user.session_version + int(changed))
            audit(request, 'user_updated', user.pk)
            return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        admin(request)
        with transaction.atomic():
            user = self.get_queryset().select_for_update().get(pk=pk)
            raw = request.data.get('password')
            check_password(raw, user)
            user.set_password(raw)
            user.must_change_password = True
            user.session_version += 1
            user.save()
            audit(request, 'password_reset', user.pk)
        return Response({'ok': True})


class References(ModelViewSet):
    serializer_class = ReferenceSerializer
    # Preserve identifiers for later order references; deactivate instead of deleting.
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = Reference.objects.all()
        kind = self.request.query_params.get('kind')
        if kind:
            qs = qs.filter(kind=kind)
        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q))
        return qs

    def perform_create(self, serializer):
        with transaction.atomic():
            row = serializer.save()
            row.assign_code()
            audit(self.request, 'reference_created', row.pk)

    def perform_update(self, serializer):
        with transaction.atomic():
            row = serializer.save()
            audit(self.request, 'reference_updated', row.pk)


@api_view(['GET', 'PATCH'])
def company(request):
    if request.method == 'PATCH':
        admin(request)
    row, _ = Company.objects.get_or_create(pk=1)
    if request.method == 'PATCH':
        serializer = CompanySerializer(row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save()
            audit(request, 'company_updated', 1)
    return Response(CompanySerializer(row).data)


@api_view(['GET'])
def overview(request):
    return Response({'references': {key: Reference.objects.filter(kind=key, is_active=True).count() for key, _ in Reference.KINDS}, 'active_users': User.objects.filter(is_active=True).count() if request.user.role == 'admin' else None})
