#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'demo_project.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed?"
        ) from exc
    
    print('Django server with Prism payment middleware')
    print('Server running on http://localhost:8000')
    print('Routes:')
    print('  GET /              - Free route')
    print('  GET /api/premium/  - Requires payment (0.01 ETH)')
    print('  GET /api/weather/  - Requires payment ($0.001)')
    
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
