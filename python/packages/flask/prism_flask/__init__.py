"""
Prism Flask Middleware
Flask middleware for x402 payment protocol
"""

from typing import Dict, Callable, Optional
from flask import Request, Response, g, jsonify
from functools import wraps
from prism_sdk_core import (
    PrismMiddlewareCore,
    PrismMiddlewareConfig,
    RoutePaymentConfig,
    HeaderAdapter,
    detect_protocol_version
)


def prism_payment_middleware(
    app,
    config: PrismMiddlewareConfig,
    routes: Dict[str, RoutePaymentConfig]
):
    """
    Flask middleware for Prism payment protection
    
    Example:
        from flask import Flask
        from prism_flask import prism_payment_middleware
        from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig
        
        app = Flask(__name__)
        
        prism_payment_middleware(
            app,
            PrismMiddlewareConfig(api_key='dev-key-123'),
            {
                '/api/premium': RoutePaymentConfig(price=0.01, description='Premium API')
            }
        )
    """
    core = PrismMiddlewareCore(config, routes)
    
    @app.before_request
    def check_payment():
        """Check payment before each request"""
        from flask import request
        
        # Construct resource URL
        resource_url = request.url
        
        # Get payment header (supports both v1 X-PAYMENT and v2 PAYMENT-SIGNATURE)
        payment_header = HeaderAdapter.get_payment_payload(
            lambda name: request.headers.get(name)
        )
        
        # Detect protocol version
        protocol_version = config.x402_version  # Default from config
        if payment_header:
            detected = detect_protocol_version(payment_header)
            if detected:
                protocol_version = detected
        
        # Store protocol version in g for after_request
        g.prism_protocol_version = protocol_version
        
        # Process through middleware core
        result = core.handle_request(
            path=request.path,
            resource_url=resource_url,
            payment_header=payment_header,
            protocol_version=protocol_version
        )
        
        # If middleware handled (returned 402 or error)
        if result.handled:
            response = jsonify(result.body)
            response.status_code = result.status_code
            
            # Set headers
            for key, value in result.headers.items():
                response.headers[key] = value
          Get protocol version from g (set in before_request)
        protocol_version = getattr(g, 'prism_protocol_version', config.x402_version)
        
        # Only settle if payment was verified
        if hasattr(g, 'prism_payment') and response.status_code < 400:
            try:
                settlement_result = core.settlement_callback(
                    g.prism_payment,
                    g.prism_requirements,
                    response.status_code
                )
                
                if settlement_result.get('success') and settlement_result.get('transaction'):
                    # Use HeaderAdapter to set correct header based on protocol version
                    import json
                    import base64
                    settlement_response = json.dumps(settlement_result)
                    settlement_base64 = base64.b64encode(settlement_response.encode()).decode()
                    HeaderAdapter.set_settlement_response(
                        lambda name, value: response.headers.__setitem__(name, value),
                        settlement_base64,
                        protocol_version
                    )
                elif settlement_result and not settlement_result.get('success'):
                    # Settlement failed - DO NOT send data, return 402 Payment Required
                    error_reason = settlement_result.get('errorReason', 'Unknown error')
                    print(f"[Prism] Settlement failed: {error_reason}")
                    return jsonify({
                        'x402Version': protocol_version,
                        'error': 'Payment settlement failed',
                        'details': error_reason or 'Payment could not be settled. Please try again.'
                    }), 402
            except Exception as e:
                if config.debug:
                    print(f"[Prism] Settlement error: {e}")
                # Settlement error - DO NOT send data, return 500 error
                return jsonify({
                    'x402Version': protocol_versionled - DO NOT send data, return 402 Payment Required
                    error_reason = settlement_result.get('errorReason', 'Unknown error')
                    print(f"[Prism] Settlement failed: {error_reason}")
                    return jsonify({
                        'x402Version': 1,
                        'error': 'Payment settlement failed',
                        'details': error_reason or 'Payment could not be settled. Please try again.'
                    }), 402
            except Exception as e:
                if config.debug:
                    print(f"[Prism] Settlement error: {e}")
                # Settlement error - DO NOT send data, return 500 error
                return jsonify({
                    'x402Version': 1,
                    'error': 'Settlement processing error',
                    'details': 'An error occurred while settling the payment. Please try again.'
                }), 500
        
        return response


def require_payment(price: float | str, description: str):
    """
    Decorator for protecting individual Flask routes
    
    Example:
        @app.route('/api/premium')
        @require_payment(price=0.01, description='Premium API')
        def premium():
            payer = g.prism_payer
            return {'message': 'Premium content', 'payer': payer}
    """
    def decorator(f: Callable):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            from flask import request, g
            
            # Check if payment info exists
            if not hasattr(g, 'prism_payer'):
                return jsonify({
                    'error': 'Payment Required',
                    'message': description
                }), 402
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator


__all__ = ['prism_payment_middleware', 'require_payment']
