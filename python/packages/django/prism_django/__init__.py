"""
Prism Django Middleware
Django middleware for x402 payment protocol
"""

from typing import Dict, Callable, Optional
from django.http import JsonResponse, HttpRequest, HttpResponse
from django.conf import settings
from prism_sdk_core import (
    PrismMiddlewareCore,
    PrismMiddlewareConfig,
    RoutePaymentConfig
)


class PrismPaymentMiddleware:
    """
    Django middleware for Prism payment protection
    
    Add to settings.py:
        MIDDLEWARE = [
            ...
            'prism_django.PrismPaymentMiddleware',
        ]
        
        PRISM_CONFIG = {
            'api_key': 'dev-key-123',
            'base_url': 'https://prism-api.1stdigital.tech',
            'debug': True
        }
        
        PRISM_ROUTES = {
            '/api/premium/': {'price': 0.01, 'description': 'Premium API'},
            '/api/weather/': {'price': '$0.001', 'description': 'Weather data'}
        }
    """
    
    def __init__(self, get_response: Callable):
        self.get_response = get_response
        
        # Load configuration from Django settings
        prism_config_dict = getattr(settings, 'PRISM_CONFIG', {})
        prism_routes_dict = getattr(settings, 'PRISM_ROUTES', {})
        
        # Convert to config objects
        config = PrismMiddlewareConfig(
            api_key=prism_config_dict.get('api_key', ''),
            base_url=prism_config_dict.get('base_url', 'https://prism-api.1stdigital.tech'),
            debug=prism_config_dict.get('debug', False)
        )
        
        routes = {
            path: RoutePaymentConfig(
                price=cfg['price'],
                description=cfg['description']
            )
            for path, cfg in prism_routes_dict.items()
        }
        
        self.core = PrismMiddlewareCore(config, routes)
        self.config = config
    
    def __call__(self, request: HttpRequest):
        """Process each request through payment verification"""
        
        # Construct resource URL
        resource_url = request.build_absolute_uri()
        
        # Get payment header
        payment_header = request.META.get('HTTP_X_PAYMENT')
        
        # Process through middleware core
        result = self.core.handle_request(
            path=request.path,
            resource_url=resource_url,
            payment_header=payment_header
        )
        
        # If middleware handled (returned 402 or error)
        if result.handled:
            response = JsonResponse(
                result.body,
                status=result.status_code
            )
            
            # Set headers
            for key, value in result.headers.items():
                response[key] = value
            
            return response
        
        # Payment verified or route not protected
        if result.payment_info:
            # Store payment info in request for view access
            request.prism_payment = result.payment_info['payment']
            request.prism_payer = result.payment_info['payer']
            request.prism_requirements = result.payment_info['payment_requirements']
        
        # Call the view
        response = self.get_response(request)
        
        # Settlement callback after successful response
        if result.payment_info and response.status_code < 400:
            try:
                settlement_result = self.core.settlement_callback(
                    result.payment_info['payment'],
                    result.payment_info['payment_requirements'],
                    response.status_code
                )
                
                if settlement_result.get('success') and settlement_result.get('transaction'):
                    response['X-Payment-Response'] = settlement_result['transaction']
            except Exception as e:
                if self.config.debug:
                    print(f"[Prism] Settlement error: {e}")
                # Continue sending response even if settlement fails
        
        return response


# Decorator for protecting individual views
def require_payment(price: float | str, description: str):
    """
    Decorator for protecting individual Django views
    
    Example:
        from prism_django import require_payment
        
        @require_payment(price=0.01, description='Premium API')
        def premium_view(request):
            payer = getattr(request, 'prism_payer', None)
            return JsonResponse({'message': 'Premium content', 'payer': payer})
    """
    def decorator(view_func: Callable):
        def wrapped_view(request: HttpRequest, *args, **kwargs):
            # Check if payment info exists
            if not hasattr(request, 'prism_payer'):
                return JsonResponse(
                    {
                        'error': 'Payment Required',
                        'message': description
                    },
                    status=402
                )
            
            return view_func(request, *args, **kwargs)
        
        return wrapped_view
    return decorator


__all__ = ['PrismPaymentMiddleware', 'require_payment']
