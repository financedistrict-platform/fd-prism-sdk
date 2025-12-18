"""
Prism FastAPI Middleware
FastAPI middleware for x402 payment protocol (async)
"""

from typing import Dict, Callable, Optional
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from prism_sdk_core import (
    PrismMiddlewareCore,
    PrismMiddlewareConfig,
    RoutePaymentConfig
)


class PrismPaymentMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware for Prism payment protection
    Uses Starlette BaseHTTPMiddleware for async support
    """
    
    def __init__(
        self,
        app: FastAPI,
        config: PrismMiddlewareConfig,
        routes: Dict[str, RoutePaymentConfig]
    ):
        super().__init__(app)
        self.core = PrismMiddlewareCore(config, routes)
        self.config = config
    
    async def dispatch(self, request: Request, call_next: Callable):
        """Process each request through payment verification"""
        
        # Construct resource URL
        resource_url = str(request.url)
        
        # Get payment header
        payment_header = request.headers.get('x-payment')
        
        # Process through middleware core
        result = self.core.handle_request(
            path=request.url.path,
            resource_url=resource_url,
            payment_header=payment_header
        )
        
        # If middleware handled (returned 402 or error)
        if result.handled:
            return JSONResponse(
                status_code=result.status_code,
                content=result.body,
                headers=result.headers
            )
        
        # Payment verified or route not protected
        if result.payment_info:
            # Store payment info in request state
            request.state.prism_payment = result.payment_info['payment']
            request.state.prism_payer = result.payment_info['payer']
            request.state.prism_requirements = result.payment_info['payment_requirements']
        
        # Call the route handler
        response = await call_next(request)
        
        # Settlement callback after successful response
        if result.payment_info and response.status_code < 400:
            try:
                settlement_result = self.core.settlement_callback(
                    result.payment_info['payment'],
                    result.payment_info['payment_requirements'],
                    response.status_code
                )
                
                if settlement_result.get('success') and settlement_result.get('transaction'):
                    response.headers['X-Payment-Response'] = settlement_result['transaction']
                elif settlement_result and not settlement_result.get('success'):
                    # Settlement failed - DO NOT send data, return 402 Payment Required
                    error_reason = settlement_result.get('errorReason', 'Unknown error')
                    print(f"[Prism] Settlement failed: {error_reason}")
                    return JSONResponse(
                        status_code=402,
                        content={
                            'x402Version': 1,
                            'error': 'Payment settlement failed',
                            'details': error_reason or 'Payment could not be settled. Please try again.'
                        }
                    )
            except Exception as e:
                if self.config.debug:
                    print(f"[Prism] Settlement error: {e}")
                # Settlement error - DO NOT send data, return 500 error
                return JSONResponse(
                    status_code=500,
                    content={
                        'x402Version': 1,
                        'error': 'Settlement processing error',
                        'details': 'An error occurred while settling the payment. Please try again.'
                    }
                )
        
        return response


def add_prism_middleware(
    app: FastAPI,
    config: PrismMiddlewareConfig,
    routes: Dict[str, RoutePaymentConfig]
):
    """
    Add Prism payment middleware to FastAPI app
    
    Example:
        from fastapi import FastAPI
        from prism_fastapi import add_prism_middleware
        from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig
        
        app = FastAPI()
        
        add_prism_middleware(
            app,
            PrismMiddlewareConfig(api_key='dev-key-123'),
            {
                '/api/premium': RoutePaymentConfig(price=0.01, description='Premium API')
            }
        )
    """
    app.add_middleware(PrismPaymentMiddleware, config=config, routes=routes)


# Helper to get payer from request
def get_payer(request: Request) -> Optional[str]:
    """Get payer address from request state"""
    return getattr(request.state, 'prism_payer', None)


def get_payment(request: Request) -> Optional[Dict]:
    """Get payment info from request state"""
    return getattr(request.state, 'prism_payment', None)


__all__ = [
    'PrismPaymentMiddleware',
    'add_prism_middleware',
    'get_payer',
    'get_payment'
]
