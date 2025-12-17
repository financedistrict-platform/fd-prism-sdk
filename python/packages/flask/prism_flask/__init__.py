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
    RoutePaymentConfig
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
        
        # Get payment header
        payment_header = request.headers.get('X-PAYMENT')
        
        # Process through middleware core
        result = core.handle_request(
            path=request.path,
            resource_url=resource_url,
            payment_header=payment_header
        )
        
        # If middleware handled (returned 402 or error)
        if result.handled:
            response = jsonify(result.body)
            response.status_code = result.status_code
            
            # Set headers
            for key, value in result.headers.items():
                response.headers[key] = value
            
            return response
        
        # Payment verified or route not protected
        if result.payment_info:
            # Store payment info in g for route handler access
            g.prism_payment = result.payment_info['payment']
            g.prism_payer = result.payment_info['payer']
            g.prism_requirements = result.payment_info['payment_requirements']
    
    @app.after_request
    def settlement_callback(response: Response):
        """Perform settlement after successful response"""
        # Only settle if payment was verified
        if hasattr(g, 'prism_payment') and response.status_code < 400:
            try:
                settlement_result = core.settlement_callback(
                    g.prism_payment,
                    g.prism_requirements,
                    response.status_code
                )
                
                if settlement_result.get('success') and settlement_result.get('transaction'):
                    response.headers['X-Payment-Response'] = settlement_result['transaction']
            except Exception as e:
                if config.debug:
                    print(f"[Prism] Settlement error: {e}")
                # Continue sending response even if settlement fails
        
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
