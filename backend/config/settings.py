import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR.parent / '.env.local')
SECRET_KEY = os.environ['DJANGO_SECRET_KEY']
DEBUG = os.getenv('DJANGO_DEBUG', 'false').lower() == 'true'
ALLOWED_HOSTS = os.getenv('DJANGO_ALLOWED_HOSTS', '127.0.0.1,localhost').split(',')
INSTALLED_APPS = ['django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions', 'rest_framework', 'core', 'trading']
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'django.contrib.sessions.middleware.SessionMiddleware', 'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware', 'django.contrib.auth.middleware.AuthenticationMiddleware']
ROOT_URLCONF = 'config.urls'
DATABASES = {'default': {'ENGINE': 'django.db.backends.postgresql', 'NAME': os.getenv('PGDATABASE', 'marine'), 'USER': os.getenv('PGUSER', 'marine'), 'PASSWORD': os.environ['PGPASSWORD'], 'HOST': os.getenv('PGHOST', '127.0.0.1'), 'PORT': os.getenv('PGPORT', '55432')}}
AUTH_USER_MODEL = 'core.User'
PASSWORD_HASHERS = ['django.contrib.auth.hashers.BCryptSHA256PasswordHasher']
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 10}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
REST_FRAMEWORK = {'DEFAULT_AUTHENTICATION_CLASSES': ['core.auth.SessionAuthentication'], 'DEFAULT_PERMISSION_CLASSES': ['core.auth.ReadyUser'], 'EXCEPTION_HANDLER': 'core.auth.exception_handler', 'UNAUTHENTICATED_USER': None}
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
CSRF_TRUSTED_ORIGINS = os.getenv(
    'CSRF_TRUSTED_ORIGINS',
    'http://127.0.0.1:5173,http://localhost:5173,https://*.trycloudflare.com',
).split(',')
SESSION_COOKIE_AGE = 1800
SESSION_SAVE_EVERY_REQUEST = False
SECURE_CONTENT_TYPE_NOSNIFF = True
TIME_ZONE = 'Asia/Shanghai'
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
LANGUAGE_CODE = 'zh-hans'
