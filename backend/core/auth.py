from django.contrib.auth import logout
from django.utils import timezone
from rest_framework.authentication import SessionAuthentication as BaseSession
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.permissions import BasePermission


class SessionAuthentication(BaseSession):
    def authenticate(self, request):
        result = super().authenticate(request)
        if not result:
            return None
        user, _ = result
        session = request.session
        if timezone.now().timestamp() - session.get('activity', 0) >= 1800 or session.get('version') != user.session_version:
            logout(request._request)
            raise AuthenticationFailed('session_expired', code='session_expired')
        return result


class ReadyUser(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.must_change_password:
            raise PermissionDenied('password_change_required', code='password_change_required')
        return True


def exception_handler(exc, context):
    from rest_framework.views import exception_handler as base_handler
    response = base_handler(exc, context)
    if response is not None:
        code = getattr(exc, 'default_code', 'invalid')
        if hasattr(exc, 'get_codes'):
            codes = exc.get_codes()
            if isinstance(codes, str):
                code = codes
        response.data = {'code': code, 'fields': response.data if code == 'invalid' else None}
    return response
