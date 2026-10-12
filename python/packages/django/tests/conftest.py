"""
Django test configuration — configure settings before collection.
"""

from __future__ import annotations


def pytest_configure():
    from django.conf import settings
    settings.configure(
        DATABASES={'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}},
        ALLOWED_HOSTS=['testserver'],
        INSTALLED_APPS=['django.contrib.contenttypes', 'django.contrib.auth'],
        PRISM_CONFIG={'api_key': 'test-key', 'debug': True},
        PRISM_ROUTES={'/api/premium/': {'price': 0.01, 'description': 'Premium API'}},
    )
