"""
Django settings for Prism payment demo project
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-dev-key-for-demo-only')
DEBUG = os.environ.get('DEBUG', 'false').lower() == 'true'
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost').split(',')

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.staticfiles',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.common.CommonMiddleware',
    # Add Prism payment middleware
    'prism_django.PrismPaymentMiddleware',
]

ROOT_URLCONF = 'demo_project.urls'

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [],
    'APP_DIRS': True,
}]

# Prism Payment Configuration
PRISM_CONFIG = {
    'API_KEY': 'dev-key-123',
    'BASE_URL': 'https://prism-gw.test.1stdigital.tech',
    'DEBUG': True,
    'ROUTES': {
        '/api/premium/': {
            'price': 0.01,
            'description': 'Premium API access'
        },
        '/api/weather/': {
            'price': '$0.001',
            'description': 'Weather data access'
        }
    }
}

# Static files
STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
