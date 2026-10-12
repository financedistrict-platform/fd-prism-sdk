"""
Prism SDK Core - Python
Payment verification middleware core logic
"""

from __future__ import annotations

from typing import Optional, Dict, Any, List, TypedDict, Literal
from dataclasses import dataclass
import httpx
import json
import base64
from decimal import Decimal, InvalidOperation
from enum import Enum

# Import compatibility layer components
from .types_v1 import PaymentPayloadV1, PaymentRequirementsV1, SettlementResponseV1
from .types_v2 import PaymentPayloadV2, PaymentRequirementsV2, SettlementResponseV2, ResourceInfoV2
from .header_adapter import HeaderAdapter
from .version_detector import detect_protocol_version, get_default_protocol_version
from .schema_transformer import SchemaTransformer
from .network_mapper import normalize_network
from .route_matcher import find_route, validate_route_pattern


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


PRISM_ROUTE_ATTR = '__prism_route__'


def normalize_price(price: Any) -> Decimal:
    if isinstance(price, bool) or not isinstance(price, (int, float, str)):
        raise ValueError(f"price must be a number or a numeric string, got {price!r}")
    text = price.strip() if isinstance(price, str) else str(price)
    if text.startswith('$'):
        text = text[1:]
    try:
        value = Decimal(text)
    except InvalidOperation:
        raise ValueError(f"price is not numeric: {price!r}") from None
    if not value.is_finite() or value < 0:
        raise ValueError(f"price must be a finite non-negative number: {price!r}")
    return value


def prices_match(left: Any, right: Any) -> bool:
    try:
        return normalize_price(left) == normalize_price(right)
    except ValueError:
        return False


def bind_decorator_route(view: Any, price: float | str, description: str) -> RoutePaymentConfig:
    normalize_price(price)
    route = RoutePaymentConfig(price=price, description=description)
    setattr(view, PRISM_ROUTE_ATTR, route)
    return route


def get_decorator_route(view: Any) -> Optional[RoutePaymentConfig]:
    route = getattr(view, PRISM_ROUTE_ATTR, None)
    return route if isinstance(route, RoutePaymentConfig) else None


ROUTE_CONFIG_KEYS = frozenset({'price', 'description', 'currency'})
ROUTE_CONFIG_REQUIRED_KEYS = frozenset({'price', 'description'})


def normalize_routes(routes: Dict[str, Any]) -> Dict[str, RoutePaymentConfig]:
    if not isinstance(routes, dict):
        raise ValueError(f"routes must be a dict of path pattern to route config, got {type(routes).__name__}")

    normalized: Dict[str, RoutePaymentConfig] = {}
    for pattern, value in routes.items():
        validate_route_pattern(pattern)
        if isinstance(value, RoutePaymentConfig):
            normalized[pattern] = value
            continue
        if not isinstance(value, dict):
            raise ValueError(f"Route {pattern!r} must be a RoutePaymentConfig or a dict, got {type(value).__name__}")
        unknown = sorted(str(key) for key in value if key not in ROUTE_CONFIG_KEYS)
        if unknown:
            raise ValueError(f"Route {pattern!r} has unknown keys: {', '.join(unknown)}")
        missing = sorted(ROUTE_CONFIG_REQUIRED_KEYS - value.keys())
        if missing:
            raise ValueError(f"Route {pattern!r} is missing required keys: {', '.join(missing)}")
        normalized[pattern] = RoutePaymentConfig(**value)
    return normalized


@dataclass
class PrismMiddlewareConfig:
    """Core middleware configuration"""
    api_key: str
    base_url: str = "https://prism-api.1stdigital.tech"
    mode: ConfigurationMode = ConfigurationMode.ON_DEMAND
    debug: bool = False
    timeout: int = 30
    x402_version: Literal[1, 2] = 2  # Default to v2
    allowed_versions: Optional[List[Literal[1, 2]]] = None  # Default [2]; rejects payloads outside whitelist


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
    """HTTP client for Prism Gateway API — sync (httpx.Client) + async (httpx.AsyncClient)."""

    def __init__(self, config: PrismMiddlewareConfig):
        if not config.api_key or not config.api_key.strip():
            raise ValueError("PrismClient: api_key is required and cannot be empty")
        self.config = config
        self._headers = {
            'X-API-Key': config.api_key,  # gateway expects this exact casing
            'Content-Type': 'application/json',
            'User-Agent': 'Prism-Python-SDK/1.0.0',
        }
        self._sync_client = httpx.Client(
            headers=self._headers,
            timeout=config.timeout,
        )

    @property
    def _async_client(self) -> httpx.AsyncClient:
        if not hasattr(self, '_async_client_instance'):
            self._async_client_instance = httpx.AsyncClient(
                headers=self._headers,
                timeout=self.config.timeout,
            )
        return self._async_client_instance

    def close(self):
        """Explicit cleanup of HTTP clients."""
        self._sync_client.close()
        if hasattr(self, '_async_client_instance'):
            import asyncio
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(self._async_client_instance.aclose())
                else:
                    loop.run_until_complete(self._async_client_instance.aclose())
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Sync methods
    # ------------------------------------------------------------------

    def _api_url(self, path: str) -> str:
        v = self.config.x402_version
        return f"{self.config.base_url}/api/v{v}/payment/{path}"

    def get_payment_requirements(
        self,
        resource_url: str,
        price: float | str,
        description: str,
    ) -> Dict[str, Any]:
        """Get payment requirements from Gateway."""
        try:
            response = self._sync_client.post(
                self._api_url('requirements'),
                json={
                    'resourceUrl': resource_url,
                    'requestedAmount': price,
                    'description': description,
                    'mimeType': 'application/json',
                },
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            if self.config.debug:
                print(f"[Prism] Payment requirements error: {e}")
            raise

    def verify_payment(
        self,
        payment_payload: Dict[str, Any],
        requirements: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Verify payment signature. Returns dict with 'valid' bool normalized from isValid."""
        try:
            response = self._sync_client.post(
                self._api_url('verify'),
                json={'paymentPayload': payment_payload, 'paymentRequirements': requirements},
            )
            data = response.json()
            if self.config.debug:
                print(f"[Prism] verify response ({response.status_code}): {data}")
            if response.status_code >= 400:
                raise httpx.HTTPStatusError(
                    f"HTTP {response.status_code}: {data}",
                    request=response.request,
                    response=response,
                )
            # Normalize isValid → valid for internal middleware use
            data.setdefault('valid', data.get('isValid', False))
            return data
        except httpx.HTTPStatusError:
            raise
        except Exception as e:
            if self.config.debug:
                print(f"[Prism] Payment verification error: {e}")
            raise

    def settle_payment(
        self,
        payment_payload: Dict[str, Any],
        requirements: Dict[str, Any],
        status_code: int,
    ) -> Dict[str, Any]:
        """Notify gateway of resource delivery (settlement)."""
        try:
            response = self._sync_client.post(
                self._api_url('settle'),
                json={'paymentPayload': payment_payload, 'paymentRequirements': requirements},
            )
            data = response.json()
            if self.config.debug:
                print(f"[Prism] settle response ({response.status_code}): {data}")
            # Gateway may return 200 with success:false — always return parsed body
            if response.status_code >= 400:
                return {
                    'success': False,
                    'errorReason': data.get('errorReason') or data.get('error') or f'HTTP {response.status_code}',
                    **data,
                }
            return data
        except Exception as e:
            if self.config.debug:
                print(f"[Prism] Settlement error: {e}")
            return {'success': False, 'errorReason': str(e)}

    # ------------------------------------------------------------------
    # Async methods
    # ------------------------------------------------------------------

    async def aget_payment_requirements(
        self,
        resource_url: str,
        price: float | str,
        description: str,
    ) -> Dict[str, Any]:
        try:
            response = await self._async_client.post(
                self._api_url('requirements'),
                json={
                    'resourceUrl': resource_url,
                    'requestedAmount': price,
                    'description': description,
                    'mimeType': 'application/json',
                },
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            if self.config.debug:
                print(f"[Prism] Payment requirements error: {e}")
            raise

    async def averify_payment(
        self,
        payment_payload: Dict[str, Any],
        requirements: Dict[str, Any],
    ) -> Dict[str, Any]:
        try:
            response = await self._async_client.post(
                self._api_url('verify'),
                json={'paymentPayload': payment_payload, 'paymentRequirements': requirements},
            )
            data = response.json()
            if self.config.debug:
                print(f"[Prism] verify response ({response.status_code}): {data}")
            if response.status_code >= 400:
                raise httpx.HTTPStatusError(
                    f"HTTP {response.status_code}: {data}",
                    request=response.request,
                    response=response,
                )
            data.setdefault('valid', data.get('isValid', False))
            return data
        except httpx.HTTPStatusError:
            raise
        except Exception as e:
            if self.config.debug:
                print(f"[Prism] Payment verification error: {e}")
            raise

    async def asettle_payment(
        self,
        payment_payload: Dict[str, Any],
        requirements: Dict[str, Any],
        status_code: int,
    ) -> Dict[str, Any]:
        try:
            response = await self._async_client.post(
                self._api_url('settle'),
                json={'paymentPayload': payment_payload, 'paymentRequirements': requirements},
            )
            data = response.json()
            if self.config.debug:
                print(f"[Prism] settle response ({response.status_code}): {data}")
            if response.status_code >= 400:
                return {
                    'success': False,
                    'errorReason': data.get('errorReason') or data.get('error') or f'HTTP {response.status_code}',
                    **data,
                }
            return data
        except Exception as e:
            if self.config.debug:
                print(f"[Prism] Settlement error: {e}")
            return {'success': False, 'errorReason': str(e)}


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
        self.routes = normalize_routes(routes)
        self.client = PrismClient(config)
        self.allowed_versions: List[Literal[1, 2]] = config.allowed_versions if config.allowed_versions is not None else [2]
    
    def find_matching_route(self, path: str) -> Optional[RoutePaymentConfig]:
        """Find matching route configuration for path"""
        return find_route(path, self.routes)
    
    def handle_request(
        self,
        path: str,
        resource_url: str,
        payment_header: Optional[str] = None,
        protocol_version: Optional[Literal[1, 2]] = None,
        route_override: Optional[RoutePaymentConfig] = None
    ) -> MiddlewareResult:
        """
        Handle payment verification for a request
        Returns MiddlewareResult indicating whether to return 402 or continue
        
        Args:
            path: Request path
            resource_url: Full resource URL
            payment_header: Payment header value (base64 encoded)
            protocol_version: Protocol version (auto-detected if not provided)
            route_override: Route configuration that replaces the one matched by path
        """
        # Check if route requires payment
        route_config = route_override or self.find_matching_route(path)
        
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
            # Always log server-side; never expose internal details to client
            print(f"[Prism] Payment requirements error: {e}")
            return MiddlewareResult(
                handled=True,
                status_code=500,
                body={'error': 'Failed to get payment requirements'}
            )
        
        # Transform requirements to target protocol version for response
        requirements_for_client = SchemaTransformer.transform_payment_required_response(
            requirements,
            protocol_version
        )

        # Extract single PaymentRequirements item for verify/settle calls.
        # Gateway /verify and /settle expect paymentRequirements = accepts[0],
        # not the full PaymentRequiredResponse envelope.
        accepts = requirements.get('accepts', [])
        single_requirement = accepts[0] if accepts else requirements

        # If no payment provided, return 402
        if not payment_header:
            # Set X-PAYMENT-REQUIREMENTS (v1) or PAYMENT-REQUIRED (v2) header
            # so x402 clients (e.g. fdx CLI) can read requirements from headers
            req_header_name = 'PAYMENT-REQUIRED' if protocol_version == 2 else 'X-PAYMENT-REQUIREMENTS'
            return MiddlewareResult(
                handled=True,
                status_code=402,
                headers={
                    'Content-Type': 'application/json',
                    req_header_name: json.dumps(requirements_for_client),
                },
                body=requirements_for_client,
            )

        # Decode and normalize payment payload (v1 -> v2 if needed)
        try:
            payment_data = self._decode_payment_header(payment_header)
            payload_version = payment_data.get('x402Version', protocol_version)

            # Reject if client's protocol version is not in the server's allowed list
            if payload_version != protocol_version and payload_version not in self.allowed_versions:
                return MiddlewareResult(
                    handled=True,
                    status_code=400,
                    body={'error': 'Invalid payment header'}
                )
            # Override to client's version only if whitelisted
            if payload_version in self.allowed_versions:
                protocol_version = payload_version

            # Normalize to v2 for internal processing
            if payload_version == 1:
                payment_data = SchemaTransformer.upgrade_payment_payload(payment_data)
        except Exception as e:
            # Always log server-side; never expose internal details to client
            print(f"[Prism] Invalid payment header: {e}")
            return MiddlewareResult(
                handled=True,
                status_code=400,
                body={'error': 'Invalid payment header'}
            )

        # Verify payment — pass decoded payload and single requirement (not full envelope)
        try:
            verification = self.client.verify_payment(payment_data, single_requirement)

            if not verification.get('valid'):
                return MiddlewareResult(
                    handled=True,
                    status_code=402,
                    headers={'Content-Type': 'application/json'},
                    body={
                        'error': 'Invalid Payment',
                        'message': verification.get('invalidReason', verification.get('error', 'Payment verification failed')),
                        'payment': requirements_for_client
                    }
                )

            # Store single_requirement for settlement (not the full envelope)
            return MiddlewareResult(
                handled=False,
                payment_info={
                    'payment': payment_data,
                    'payer': verification.get('payer'),
                    'payment_requirements': single_requirement,
                    'protocol_version': protocol_version,
                    'route_price': route_config.price
                }
            )

        except Exception as e:
            # Always log server-side; never expose internal details to client
            print(f"[Prism] Payment verification error: {e}")
            return MiddlewareResult(
                handled=True,
                status_code=500,
                body={'error': 'Payment verification failed'}
            )
    
    _MAX_PAYMENT_HEADER_BYTES = 8192  # ~10× real x402 payload size

    def _decode_payment_header(self, payment_header: str) -> Optional[Dict[str, Any]]:
        """Decode payment header (base64 JSON) and validate its basic shape.

        Returns None if the header does not decode to a dict, or if it is
        missing required fields / has fields of the wrong type for its
        declared x402Version.
        """
        # Reject oversized headers before decoding to prevent memory exhaustion
        if len(payment_header) > self._MAX_PAYMENT_HEADER_BYTES:
            raise ValueError(
                f"Payment header exceeds maximum size ({len(payment_header)} > {self._MAX_PAYMENT_HEADER_BYTES} bytes)"
            )

        decoded: Any = None
        try:
            # Try direct JSON parse
            decoded = json.loads(payment_header)
        except (json.JSONDecodeError, ValueError):
            try:
                # Try base64 decode then JSON parse
                raw = base64.b64decode(payment_header).decode('utf-8')
                decoded = json.loads(raw)
            except Exception as e:
                raise ValueError(f"Failed to decode payment header: {e}")

        if not isinstance(decoded, dict):
            return None

        if not self._validate_payment_payload_shape(decoded):
            return None

        return decoded

    @staticmethod
    def _validate_payment_payload_shape(data: Dict[str, Any]) -> bool:
        """Minimal structural validation of a decoded payment payload.

        Rejects payloads that are missing required fields or have fields of
        the wrong primitive type. This is intentionally pragmatic — it does
        not attempt full schema validation, just enough to reject malformed
        shapes before they reach the gateway.
        """

        def _is_str(v: Any) -> bool:
            return isinstance(v, str)

        def _authorization_ok(authorization: Any) -> bool:
            if not isinstance(authorization, dict):
                return False
            required = ('from', 'to', 'value', 'validAfter', 'validBefore', 'nonce')
            return all(_is_str(authorization.get(field)) for field in required)

        def _payload_ok(payload: Any) -> bool:
            if not isinstance(payload, dict):
                return False
            if not _is_str(payload.get('signature')):
                return False
            return _authorization_ok(payload.get('authorization'))

        x402_version = data.get('x402Version')

        if x402_version == 2:
            accepted = data.get('accepted')
            if not isinstance(accepted, dict):
                return False
            if not (
                _is_str(accepted.get('scheme'))
                and _is_str(accepted.get('network'))
                and _is_str(accepted.get('asset'))
            ):
                return False
            return _payload_ok(data.get('payload'))

        # v1 (or unspecified/legacy) flat shape
        if not (_is_str(data.get('scheme')) and _is_str(data.get('network'))):
            return False
        return _payload_ok(data.get('payload'))
    
    def settlement_callback(
        self,
        payment: Dict[str, Any],
        requirements: Dict[str, Any],
        status_code: int,
    ) -> Dict[str, Any]:
        """Settlement callback after successful response (sync)."""
        if status_code >= 400:
            return {'success': False, 'reason': 'Status code >= 400'}
        return self.client.settle_payment(payment, requirements, status_code)

    # ------------------------------------------------------------------
    # Async counterparts for ASGI frameworks
    # ------------------------------------------------------------------

    async def ahandle_request(
        self,
        path: str,
        resource_url: str,
        payment_header: Optional[str] = None,
        protocol_version: Optional[Literal[1, 2]] = None,
        route_override: Optional[RoutePaymentConfig] = None,
    ) -> MiddlewareResult:
        """Async version of handle_request for ASGI frameworks."""
        route_config = route_override or self.find_matching_route(path)
        if not route_config:
            return MiddlewareResult(handled=False)

        if protocol_version is None:
            if payment_header:
                detected = detect_protocol_version(payment_header)
                protocol_version = detected if detected else self.config.x402_version
            else:
                protocol_version = self.config.x402_version

        try:
            requirements = await self.client.aget_payment_requirements(
                resource_url=resource_url,
                price=route_config.price,
                description=route_config.description,
            )
        except Exception as e:
            # Always log server-side; never expose internal details to client
            print(f"[Prism] Payment requirements error: {e}")
            return MiddlewareResult(
                handled=True, status_code=500,
                body={'error': 'Failed to get payment requirements'},
            )

        requirements_for_client = SchemaTransformer.transform_payment_required_response(
            requirements, protocol_version
        )

        # Extract single PaymentRequirements item for verify/settle calls
        accepts = requirements.get('accepts', [])
        single_requirement = accepts[0] if accepts else requirements

        if not payment_header:
            req_header_name = 'PAYMENT-REQUIRED' if protocol_version == 2 else 'X-PAYMENT-REQUIREMENTS'
            return MiddlewareResult(
                handled=True, status_code=402,
                headers={
                    'Content-Type': 'application/json',
                    req_header_name: json.dumps(requirements_for_client),
                },
                body=requirements_for_client,
            )

        try:
            payment_data = self._decode_payment_header(payment_header)
            payload_version = payment_data.get('x402Version', protocol_version)

            # Reject if client's protocol version is not in the server's allowed list
            if payload_version != protocol_version and payload_version not in self.allowed_versions:
                return MiddlewareResult(
                    handled=True,
                    status_code=400,
                    body={'error': 'Invalid payment header'}
                )
            # Override to client's version only if whitelisted
            if payload_version in self.allowed_versions:
                protocol_version = payload_version

            # Normalize to v2 for internal processing
            if payload_version == 1:
                payment_data = SchemaTransformer.upgrade_payment_payload(payment_data)
        except Exception as e:
            # Always log server-side; never expose internal details to client
            print(f"[Prism] Invalid payment header: {e}")
            return MiddlewareResult(
                handled=True, status_code=400,
                body={'error': 'Invalid payment header'},
            )

        try:
            verification = await self.client.averify_payment(payment_data, single_requirement)
            if not verification.get('valid'):
                return MiddlewareResult(
                    handled=True, status_code=402,
                    body={
                        'error': 'Invalid Payment',
                        'message': verification.get('invalidReason', verification.get('error', 'Payment verification failed')),
                        'payment': requirements_for_client,
                    },
                )
            return MiddlewareResult(
                handled=False,
                payment_info={
                    'payment': payment_data,
                    'payer': verification.get('payer'),
                    'payment_requirements': single_requirement,
                    'protocol_version': protocol_version,
                    'route_price': route_config.price,
                },
            )
        except Exception as e:
            # Always log server-side; never expose internal details to client
            print(f"[Prism] Payment verification error: {e}")
            return MiddlewareResult(
                handled=True, status_code=500,
                body={'error': 'Payment verification failed'},
            )

    async def asettlement_callback(
        self,
        payment: Dict[str, Any],
        requirements: Dict[str, Any],
        status_code: int,
    ) -> Dict[str, Any]:
        """Async settlement callback."""
        if status_code >= 400:
            return {'success': False, 'reason': 'Status code >= 400'}
        return await self.client.asettle_payment(payment, requirements, status_code)


__all__ = [
    'PrismClient',
    'PrismMiddlewareCore',
    'PrismMiddlewareConfig',
    'RoutePaymentConfig',
    'normalize_routes',
    'normalize_price',
    'prices_match',
    'bind_decorator_route',
    'get_decorator_route',
    'PRISM_ROUTE_ATTR',
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
