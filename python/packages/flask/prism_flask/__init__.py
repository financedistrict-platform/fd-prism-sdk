"""
Prism Flask Middleware
Flask middleware for x402 payment protocol
"""

from __future__ import annotations

import json
import base64
from typing import Dict, Callable, Optional
from flask import current_app, g, jsonify, make_response
from functools import wraps
from prism_sdk_core import (
    PrismMiddlewareCore,
    PrismMiddlewareConfig,
    RoutePaymentConfig,
    HeaderAdapter,
    bind_decorator_route,
    detect_protocol_version,
    get_decorator_route,
    prices_match
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
            PrismMiddlewareConfig(api_key=os.environ['PRISM_API_KEY']),
            {
                '/api/premium': RoutePaymentConfig(price=0.01, description='Premium API')
            }
        )
    """
    core = PrismMiddlewareCore(config, routes)

    @app.before_request
    def check_payment():
        from flask import request

        payment_header = HeaderAdapter.get_payment_payload(
            lambda name: request.headers.get(name)
        )
        protocol_version = config.x402_version
        if payment_header:
            detected = detect_protocol_version(payment_header)
            if detected:
                protocol_version = detected
        g.prism_protocol_version = protocol_version

        view = current_app.view_functions.get(request.endpoint)

        result = core.handle_request(
            path=request.path,
            resource_url=request.url,
            payment_header=payment_header,
            protocol_version=protocol_version,
            route_override=get_decorator_route(view)
        )

        if result.handled:
            response = jsonify(result.body)
            response.status_code = result.status_code
            for key, value in result.headers.items():
                response.headers[key] = value
            
            return response
        
        # Payment verified - store in g with underscore prefix to avoid collision
        if result.payment_info:
            g._prism_payment_verified = True
            g._prism_payment = result.payment_info['payment']
            g._prism_payer = result.payment_info['payer']
            g._prism_requirements = result.payment_info['payment_requirements']
            g._prism_route_price = result.payment_info['route_price']
    
    @app.after_request
    def settle_payment(response):
        """Settle payment after successful response"""
        # Get protocol version from g (set in before_request)
        protocol_version = getattr(g, 'prism_protocol_version', config.x402_version)

        # Only settle if payment was verified
        if getattr(g, '_prism_payment_verified', False) and response.status_code < 400:
            try:
                settlement_result = core.settlement_callback(
                    g._prism_payment,
                    g._prism_requirements,
                    response.status_code
                )
                if settlement_result.get('success') and settlement_result.get('transaction'):
                    settlement_base64 = base64.b64encode(
                        json.dumps(settlement_result).encode()
                    ).decode()
                    HeaderAdapter.set_settlement_response(
                        lambda name, value: response.headers.__setitem__(name, value),
                        settlement_base64,
                        protocol_version
                    )
                elif settlement_result and not settlement_result.get('success'):
                    error_reason = settlement_result.get('errorReason', 'Unknown error')
                    # after_request must return a Response object, not a tuple
                    err = make_response(jsonify({
                        'x402Version': protocol_version,
                        'error': 'Payment settlement failed',
                        'details': error_reason
                    }), 402)
                    return err
            except Exception as e:
                print(f"[Prism] Settlement error: {e}")
                # Settlement error - return generic 500 error
                err = make_response(jsonify({
                    'x402Version': protocol_version,
                    'error': 'Settlement processing error',
                }), 500)
                return err

        return response


def require_payment(price: float | str, description: str):
    """
    Decorator for protecting individual Flask routes.

    The price given here is the price enforced for the view: the middleware
    requests, verifies and settles payment against it instead of the price of
    any middleware route that also covers the path. A view whose verified price
    differs from the decorator's price is not run.

    Example:
        @app.route('/api/premium')
        @require_payment(price=0.01, description='Premium API')
        def premium():
            payer = g._prism_payer
            return {'message': 'Premium content', 'payer': payer}
    """
    def decorator(f: Callable):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Use _prism_payment_verified flag (underscore-prefixed, set only by Prism middleware)
            # to prevent bypass via accidental attribute collision with other middleware
            if not getattr(g, '_prism_payment_verified', False):
                return jsonify({
                    'error': 'Payment Required',
                    'message': description
                }), 402

            if not prices_match(getattr(g, '_prism_route_price', None), price):
                return jsonify({
                    'error': 'Payment configuration mismatch'
                }), 500

            return f(*args, **kwargs)

        bind_decorator_route(decorated_function, price, description)
        return decorated_function
    return decorator


__all__ = ['prism_payment_middleware', 'require_payment']
