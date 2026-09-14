from django.urls import path, include
from rest_framework.routers import DefaultRouter
from core import views

router = DefaultRouter()
router.register('users', views.Users, basename='users')
router.register('reference', views.References, basename='reference')
urlpatterns = [
    path('api/trading/', include('trading.urls')),
    path('api/auth/csrf/', views.csrf), path('api/auth/login/', views.sign_in),
    path('api/auth/logout/', views.sign_out), path('api/auth/me/', views.me),
    path('api/auth/password/', views.password), path('api/auth/language/', views.language),
    path('api/auth/activity/', views.activity), path('api/company/', views.company),
    path('api/overview/', views.overview), path('api/', include(router.urls)),
]
