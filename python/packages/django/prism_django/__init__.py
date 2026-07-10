"""
Prism Django Middleware
Django middleware for x402 payment protocol
"""

from __future__ import annotations

from typing import Dict, Callable, Optional
from django.http import JsonResponse, HttpRequest, HttpResponse
from django.conf import settings
from prism_sdk_core import (
    PrismMiddlewareCore,
    PrismMiddlewareConfig,
    RoutePaymentConfig,
    HeaderAdapter,
    detect_protocol_version
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
            'api_key': os.environ['PRISM_API_KEY'],
            'base_url': 'https://prism-api.1stdigital.tech',
            'debug': False
        }
        
        PRISM_ROUTES = {
            '/api/premium/': {'price': 0.01, 'description': 'Premium API'},
            '/api/weather/': {'price': '$0.001', 'description': 'Weather data'}
        }
    """
    
    def __init__(self, get_response: Callable):
        self.get_response = get_response

        prism_config_raw = getattr(settings, 'PRISM_CONFIG', {})
        prism_routes_dict = getattr(settings, 'PRISM_ROUTES', {})

        # Accept PrismMiddlewareConfig object or dict
        if isinstance(prism_config_raw, PrismMiddlewareConfig):
            config = prism_config_raw
        else:
            config = PrismMiddlewareConfig(
                api_key=prism_config_raw.get('api_key', ''),
                base_url=prism_config_raw.get('base_url', 'https://prism-api.1stdigital.tech'),
                debug=prism_config_raw.get('debug', False),
                timeout=prism_config_raw.get('timeout', 30),
                x402_version=prism_config_raw.get('x402_version', 2),
            )

        # Accept RoutePaymentConfig objects or dicts
        routes = {
            path: (
                cfg if isinstance(cfg, RoutePaymentConfig)
                else RoutePaymentConfig(price=cfg['price'], description=cfg['description'])
            )
            for path, cfg in prism_routes_dict.items()
        }
        
        self.core = PrismMiddlewareCore(config, routes)
        self.config = config
    
    def __call__(self, request: HttpRequest):
        """Process each request through payment verification"""
        
        # Construct resource URL
        resource_url = request.build_absolute_uri()
        
        # Get payment header (supports both v1 X-PAYMENT and v2 PAYMENT-SIGNATURE)
        # Django converts headers: PAYMENT-SIGNATURE -> HTTP_PAYMENT_SIGNATURE
        payment_header = HeaderAdapter.get_payment_payload(
            lambda name: request.META.get(f'HTTP_{name.replace("-", "_").upper()}')
        )
        
        # Detect protocol version
        protocol_version = self.config.x402_version  # Default from config
        if payment_header:
            detected = detect_protocol_version(payment_header)
            if detected:
                protocol_version = detected
        
        # Process through middleware core
        result = self.core.handle_request(
            path=request.path,
            resource_url=resource_url,
            payment_header=payment_header,
            protocol_version=protocol_version
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
            # Use underscore-prefixed attributes to avoid collision with user-defined attributes
            request._prism_payment_verified = True
            request._prism_payment = result.payment_info['payment']
            request._prism_payer = result.payment_info['payer']
            request._prism_requirements = result.payment_info['payment_requirements']
        
        # Call the view
        response = self.get_response(request)
        
        # Settlement callback after successful response
        if result.payment_info and response.status_code < 400:
            protocol_version = result.payment_info.get('protocol_version', self.config.x402_version)

            try:
                settlement_result = self.core.settlement_callback(
                    result.payment_info['payment'],
                    result.payment_info['payment_requirements'],
                    response.status_code
                )
                
                if settlement_result.get('success') and settlement_result.get('transaction'):
                    # Use HeaderAdapter to set correct header based on protocol version
                    import json
                    import base64
                    settlement_response = json.dumps(settlement_result)
                    settlement_base64 = base64.b64encode(settlement_response.encode()).decode()
                    
                    # Set header using Django's response object
                    if protocol_version == 2:
                        response['PAYMENT-RESPONSE'] = settlement_base64
                    else:
                        response['X-PAYMENT-RESPONSE'] = settlement_base64
                elif settlement_result and not settlement_result.get('success'):
                    # Settlement failed - DO NOT send data, return 402 Payment Required
                    error_reason = settlement_result.get('errorReason', 'Unknown error')
                    print(f"[Prism] Settlement failed: {error_reason}")
                    return JsonResponse({
                        'x402Version': protocol_version,
                        'error': 'Payment settlement failed',
                        'details': error_reason or 'Payment could not be settled. Please try again.'
                    }, status=402)
            except Exception as e:
                print(f"[Prism] Settlement error: {e}")
                # Settlement error - DO NOT send data, return 500 error
                return JsonResponse({
                    'x402Version': protocol_version,
                    'error': 'Settlement processing error',
                    'details': 'An error occurred while settling the payment. Please try again.'
                }, status=500)
        
        return response


# Decorator for protecting individual views
def require_payment(price: float | str, description: str):
    """
    Decorator for protecting individual Django views
    
    Example:
        from prism_django import require_payment
        
        @require_payment(price=0.01, description='Premium API')
        def premium_view(request):
            payer = getattr(request, '_prism_payer', None)
            return JsonResponse({'message': 'Premium content', 'payer': payer})
    """
    def decorator(view_func: Callable):
        def wrapped_view(request: HttpRequest, *args, **kwargs):
            # Use _prism_payment_verified flag (underscore-prefixed, set only by Prism middleware)
            # to prevent bypass via accidental attribute collision with other middleware
            if not getattr(request, '_prism_payment_verified', False):
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


class AsyncPrismPaymentMiddleware:
    """
    Django ASGI async middleware for Prism payment protection.
    Requires Django 4.1+ and ASGI deployment (uvicorn, daphne).

    Replace PrismPaymentMiddleware with this class in settings.MIDDLEWARE
    when deploying with an ASGI server.
    """

    async_capable = True
    sync_capable = False

    def __init__(self, get_response: Callable):
        from asgiref.sync import markcoroutinefunction
        self.get_response = get_response
        markcoroutinefunction(self)

        prism_config_raw = getattr(settings, 'PRISM_CONFIG', {})
        prism_routes_dict = getattr(settings, 'PRISM_ROUTES', {})

        if isinstance(prism_config_raw, PrismMiddlewareConfig):
            config = prism_config_raw
        else:
            config = PrismMiddlewareConfig(
                api_key=prism_config_raw.get('api_key', ''),
                base_url=prism_config_raw.get('base_url', 'https://prism-api.1stdigital.tech'),
                debug=prism_config_raw.get('debug', False),
                timeout=prism_config_raw.get('timeout', 30),
                x402_version=prism_config_raw.get('x402_version', 2),
            )

        routes = {
            path: (
                cfg if isinstance(cfg, RoutePaymentConfig)
                else RoutePaymentConfig(price=cfg['price'], description=cfg['description'])
            )
            for path, cfg in prism_routes_dict.items()
        }

        self.core = PrismMiddlewareCore(config, routes)
        self.config = config

    async def __call__(self, request: HttpRequest):
        import json
        import base64

        resource_url = request.build_absolute_uri()
        payment_header = HeaderAdapter.get_payment_payload(
            lambda name: request.META.get(f'HTTP_{name.replace("-", "_").upper()}')
        )
        protocol_version = self.config.x402_version
        if payment_header:
            detected = detect_protocol_version(payment_header)
            if detected:
                protocol_version = detected

        result = await self.core.ahandle_request(
            path=request.path,
            resource_url=resource_url,
            payment_header=payment_header,
            protocol_version=protocol_version,
        )

        if result.handled:
            response = JsonResponse(result.body, status=result.status_code)
            for key, value in result.headers.items():
                response[key] = value
            return response

        if result.payment_info:
            # Use underscore-prefixed attributes to avoid collision with user-defined attributes,
            # matching the sync PrismPaymentMiddleware and what require_payment gates on.
            request._prism_payment_verified = True
            request._prism_payment = result.payment_info['payment']
            request._prism_payer = result.payment_info['payer']
            request._prism_requirements = result.payment_info['payment_requirements']

        response = await self.get_response(request)

        if result.payment_info and response.status_code < 400:
            try:
                settlement_result = await self.core.asettlement_callback(
                    result.payment_info['payment'],
                    result.payment_info['payment_requirements'],
                    response.status_code,
                )
                if settlement_result.get('success') and settlement_result.get('transaction'):
                    settlement_base64 = base64.b64encode(
                        json.dumps(settlement_result).encode()
                    ).decode()
                    HeaderAdapter.set_settlement_response(
                        lambda name, value: response.__setitem__(name, value),
                        settlement_base64,
                        protocol_version,
                    )
                elif settlement_result and not settlement_result.get('success'):
                    return JsonResponse({
                        'x402Version': protocol_version,
                        'error': 'Payment settlement failed',
                        'details': settlement_result.get('errorReason', 'Unknown error'),
                    }, status=402)
            except Exception as e:
                if self.config.debug:
                    print(f"[Prism] Settlement error: {e}")
                return JsonResponse({'error': 'Settlement processing error'}, status=500)

        return response


__all__ = ['PrismPaymentMiddleware', 'AsyncPrismPaymentMiddleware', 'require_payment']
