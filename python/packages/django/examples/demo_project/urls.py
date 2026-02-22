"""
Django URL Configuration for Prism payment demo
"""

from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('api/premium/', views.premium, name='premium'),
    path('api/weather/', views.weather, name='weather'),
]
