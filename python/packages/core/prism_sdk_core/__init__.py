"""
Prism SDK Core - Python
Payment verification middleware core logic
"""

from typing import Optional, Dict, Any, List, TypedDict, Literal
from dataclasses import dataclass
import requests
import json
import base64
from enum import Enum

# Import compatibility layer components
from .types_v1 import PaymentPayloadV1, PaymentRequirementsV1, SettlementResponseV1
from .types_v2 import PaymentPayloadV2, PaymentRequirementsV2, SettlementResponseV2, ResourceInfoV2
from .header_adapter import HeaderAdapter
from .version_detector import detect_protocol_version, get_default_protocol_version
from .schema_transformer import SchemaTransformer
from .network_mapper import normalize_network


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
    x402_version: Literal[1, 2] = 2  # Default to v2


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
        payment_header: Optional[str] = None,
        protocol_version: Optional[Literal[1, 2]] = None
    ) -> MiddlewareResult:
        """
        Handle payment verification for a request
        Returns MiddlewareResult indicating whether to return 402 or continue
        
        Args:
            path: Request path
            resource_url: Full resource URL
            payment_header: Payment header value (base64 encoded)
            protocol_version: Protocol version (auto-detected if not provided)
        """
        # Check if route requires payment
        route_config = self.find_matching_route(path)
        
        if not route_config:
            # Route not protected, pass through
            return MiddlewareResult(handled=False)
        
        # Detect protocol version if not provided
        if protocol_version is None:
            if payment_header:
                detected = detect_protocol_version(payment_header)
                protocol_version = detected if detected else self.config.x402_version
            else:
                protocol_version = self.config.x402_version
        
        # Get payment requirements (always in v2 internally)
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
        
        # Transform requirements to target protocol version for response
        requirements_for_client = SchemaTransformer.transform_payment_required_response(
            requirements,
            protocol_version
        )
        
        # If no payment provided, return 402
        if not payment_header:
            return MiddlewareResult(
                handled=True,
                status_code=402,
                headers={
                    'Content-Type': 'application/json',
                    'WWW-Authenticate': 'Payment',
                    **requirements_for_client.get('headers', {})
                },
                body={
                    'error': 'Payment Required',
                    'message': f'Payment required: {route_config.description}',
                    'payment': requirements_for_client
                }
            )
        
        # Decode and normalize payment payload (v1 -> v2 if needed)
        try:
            payment_data = self._decode_payment_header(payment_header)
            payload_version = payment_data.get('x402Version', protocol_version)
            
            # Normalize to v2 for internal processing
            if payload_version == 1:
                payment_data = SchemaTransformer.upgrade_payment_payload(payment_data)
        except Exception as e:
            return MiddlewareResult(
                handled=True,
                status_code=400,
                body={'error': 'Invalid payment header', 'details': str(e)}
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
                        'payment': requirements_for_client
                    }
                )
            
            # Payment verified, store info and pass through
            return MiddlewareResult(
                handled=False,
                payment_info={
                    'payment': verification.get('payment'),
                    'payer': verification.get('payer'),
                    'payment_requirements': requirements,
                    'protocol_version': protocol_version
                }
            )
            
        except Exception as e:
            # Verification error, return 500
            return MiddlewareResult(
                handled=True,
                status_code=500,
                body={'error': 'Payment verification failed', 'details': str(e)}
            )
    
    def _decode_payment_header(self, payment_header: str) -> Dict[str, Any]:
        """Decode payment header (base64 JSON)"""
        try:
            # Try direct JSON parse
            return json.loads(payment_header)
        except (json.JSONDecodeError, ValueError):
            pass
        
        try:
            # Try base64 decode then JSON parse
            decoded = base64.b64decode(payment_header).decode('utf-8')
            return json.loads(decoded)
        except Exception as e:
            raise ValueError(f"Failed to decode payment header: {e}")
    
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
    'PaymentPayload',
    # v1 types
    'PaymentPayloadV1',
    'PaymentRequirementsV1',
    'SettlementResponseV1',
    # v2 types
    'PaymentPayloadV2',
    'PaymentRequirementsV2',
    'SettlementResponseV2',
    'ResourceInfoV2',
    # Compatibility layer
    'HeaderAdapter',
    'SchemaTransformer',
    'detect_protocol_version',
    'get_default_protocol_version',
    'normalize_network',
]
