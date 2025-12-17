"""
Prism SDK Core - Python
Payment verification middleware core logic
"""

from typing import Optional, Dict, Any, List, TypedDict
from dataclasses import dataclass
import requests
from enum import Enum


class ConfigurationMode(str, Enum):
    """Configuration mode for payment requirements"""
    CLOUD = "cloud"
    FILE = "file"
    ON_DEMAND = "on-demand"


@dataclass
class RoutePaymentConfig:
    """Payment configuration for a route"""
    price: float | str  # 0.01 or "$0.001"
    description: str
    currency: Optional[str] = None


@dataclass
class PrismMiddlewareConfig:
    """Core middleware configuration"""
    api_key: str
    base_url: str = "https://prism-api.1stdigital.tech"
    mode: ConfigurationMode = ConfigurationMode.ON_DEMAND
    debug: bool = False
    timeout: int = 30


class PaymentPayload(TypedDict, total=False):
    """Payment payload from X-PAYMENT header"""
    signature: str
    payer: str
    amount: str
    nonce: str
    deadline: int


class MiddlewareResult:
    """Result from middleware processing"""
    def __init__(
        self,
        handled: bool = False,
        status_code: Optional[int] = None,
        headers: Optional[Dict[str, str]] = None,
        body: Optional[Dict[str, Any]] = None,
        payment_info: Optional[Dict[str, Any]] = None
    ):
        self.handled = handled
        self.status_code = status_code
        self.headers = headers or {}
        self.body = body
        self.payment_info = payment_info


class PrismClient:
    """HTTP client for Prism Gateway API"""
    
    def __init__(self, config: PrismMiddlewareConfig):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({
            'X-API-KEY': config.api_key,
            'Content-Type': 'application/json',
            'User-Agent': 'Prism-Python-SDK/1.0.0'
        })
    
    def get_payment_requirements(
        self,
        resource_url: str,
        price: float | str,
        description: str
    ) -> Dict[str, Any]:
        """Get payment requirements from Gateway"""
        try:
            response = self.session.post(
                f"{self.config.base_url}/v1/payment-requirements",
                json={
                    'resourceUrl': resource_url,
                    'price': price,
                    'description': description
                },
                timeout=self.config.timeout
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            if self.config.debug:
                print(f"[Prism] Payment requirements error: {e}")
            raise
    
    def verify_payment(
        self,
        payment_header: str,
        requirements: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Verify payment signature"""
        try:
            response = self.session.post(
                f"{self.config.base_url}/v1/verify-payment",
                json={
                    'payment': payment_header,
                    'requirements': requirements
                },
                timeout=self.config.timeout
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            if self.config.debug:
                print(f"[Prism] Payment verification error: {e}")
            raise
    
    def settle_payment(
        self,
        payment: Dict[str, Any],
        requirements: Dict[str, Any],
        status_code: int
    ) -> Dict[str, Any]:
        """Notify gateway of resource delivery (settlement)"""
        try:
            response = self.session.post(
                f"{self.config.base_url}/v1/settle",
                json={
                    'payment': payment,
                    'requirements': requirements,
                    'statusCode': status_code
                },
                timeout=self.config.timeout
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            if self.config.debug:
                print(f"[Prism] Settlement error: {e}")
            # Don't raise - settlement failure shouldn't block response
            return {'success': False, 'error': str(e)}


class PrismMiddlewareCore:
    """
    Core middleware logic for Prism payment processing
    Framework-agnostic logic that all framework integrations use
    """
    
    def __init__(
        self,
        config: PrismMiddlewareConfig,
        routes: Dict[str, RoutePaymentConfig]
    ):
        self.config = config
        self.routes = routes
        self.client = PrismClient(config)
    
    def find_matching_route(self, path: str) -> Optional[RoutePaymentConfig]:
        """Find matching route configuration for path"""
        # Exact match
        if path in self.routes:
            return self.routes[path]
        
        # Prefix match
        for route_path, config in self.routes.items():
            if path.startswith(route_path):
                return config
        
        return None
    
    def handle_request(
        self,
        path: str,
        resource_url: str,
        payment_header: Optional[str] = None
    ) -> MiddlewareResult:
        """
        Handle payment verification for a request
        Returns MiddlewareResult indicating whether to return 402 or continue
        """
        # Check if route requires payment
        route_config = self.find_matching_route(path)
        
        if not route_config:
            # Route not protected, pass through
            return MiddlewareResult(handled=False)
        
        # Get payment requirements
        try:
            requirements = self.client.get_payment_requirements(
                resource_url=resource_url,
                price=route_config.price,
                description=route_config.description
            )
        except Exception as e:
            # Error getting requirements, return 500
            return MiddlewareResult(
                handled=True,
                status_code=500,
                body={'error': 'Failed to get payment requirements', 'details': str(e)}
            )
        
        # If no payment provided, return 402
        if not payment_header:
            return MiddlewareResult(
                handled=True,
                status_code=402,
                headers={
                    'Content-Type': 'application/json',
                    'WWW-Authenticate': 'Payment',
                    **requirements.get('headers', {})
                },
                body={
                    'error': 'Payment Required',
                    'message': f'Payment required: {route_config.description}',
                    'payment': requirements
                }
            )
        
        # Verify payment
        try:
            verification = self.client.verify_payment(payment_header, requirements)
            
            if not verification.get('valid'):
                # Invalid payment
                return MiddlewareResult(
                    handled=True,
                    status_code=402,
                    headers={'Content-Type': 'application/json'},
                    body={
                        'error': 'Invalid Payment',
                        'message': verification.get('error', 'Payment verification failed'),
                        'payment': requirements
                    }
                )
            
            # Payment verified, store info and pass through
            return MiddlewareResult(
                handled=False,
                payment_info={
                    'payment': verification.get('payment'),
                    'payer': verification.get('payer'),
                    'payment_requirements': requirements
                }
            )
            
        except Exception as e:
            # Verification error, return 500
            return MiddlewareResult(
                handled=True,
                status_code=500,
                body={'error': 'Payment verification failed', 'details': str(e)}
            )
    
    def settlement_callback(
        self,
        payment: Dict[str, Any],
        requirements: Dict[str, Any],
        status_code: int
    ) -> Dict[str, Any]:
        """
        Settlement callback after successful response
        Should be called AFTER sending response (status < 400)
        """
        if status_code >= 400:
            return {'success': False, 'reason': 'Status code >= 400'}
        
        return self.client.settle_payment(payment, requirements, status_code)


__all__ = [
    'PrismClient',
    'PrismMiddlewareCore',
    'PrismMiddlewareConfig',
    'RoutePaymentConfig',
    'ConfigurationMode',
    'MiddlewareResult',
    'PaymentPayload'
]
