"""
Django test configuration — configure settings before collection.
"""

from __future__ import annotations


def pytest_configure():
    from django.conf import settings
    settings.configure(
        DATABASES={'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}},
        INSTALLED_APPS=['django.contrib.contenttypes', 'django.contrib.auth'],
        PRISM_CONFIG={
            'API_KEY': 'test-key',
            'DEBUG': True,
            'ROUTES': {'/api/premium/': {'price': 0.01, 'description': 'Premium API'}},
        },
    )
