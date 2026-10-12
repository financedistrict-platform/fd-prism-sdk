"""
Tests for prism_fastapi middleware — 13 test cases covering happy path,
error scenarios, settlement, helpers, and require_payment decorator.
"""

from __future__ import annotations

import json
import base64
from unittest.mock import patch, MagicMock, AsyncMock

import pytest
import httpx
from fastapi import FastAPI, Request

from prism_fastapi import add_prism_middleware, get_payer, get_payment, require_payment
from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig

pytestmark = pytest.mark.asyncio

# ---------------------------------------------------------------------------
# Shared mock data
# ---------------------------------------------------------------------------

MOCK_REQUIREMENTS = {
    'x402Version': 2,
    'amount': '1000000',
    'network': 'eip155:84532',
    'paymentAddress': '0xTEST',
    'accepted': [{'url': 'http://test/api/premium', 'description': 'Premium API'}],
}
MOCK_VERIFICATION_VALID = {'valid': True, 'payment': {'signature': '0xSIG'}, 'payer': '0xPAYER'}
MOCK_VERIFICATION_INVALID = {'valid': False, 'error': 'Invalid signature'}
MOCK_SETTLEMENT_SUCCESS = {'success': True, 'transaction': '0xTXHASH'}
MOCK_SETTLEMENT_FAILURE = {'success': False, 'errorReason': 'Insufficient funds'}

CONFIG = PrismMiddlewareConfig(api_key='test-key', debug=True)
ROUTES = {
    '/api/premium': RoutePaymentConfig(price=0.01, description='Premium API'),
    '/api/decorated': RoutePaymentConfig(price=0.01, description='Decorated route'),
}


def make_header(data: dict) -> str:
    return base64.b64encode(json.dumps(data).encode()).decode()


AUTHORIZATION = {
    'from': '0xPAYER',
    'to': '0xTEST',
    'value': '1000000',
    'validAfter': '0',
    'validBefore': '9999999999',
    'nonce': '0x01',
}
PAYLOAD = {'signature': '0xSIG', 'authorization': AUTHORIZATION}
VALID_HEADER = make_header({
    'x402Version': 2,
    'accepted': {'scheme': 'exact', 'network': 'eip155:84532', 'asset': '0xASSET'},
    'payload': PAYLOAD,
})


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_client():
    with patch('prism_sdk_core.PrismClient') as MockClient:
        inst = MockClient.return_value
        # Sync methods (used by Flask/Django sync middleware)
        inst.get_payment_requirements.return_value = MOCK_REQUIREMENTS
        inst.verify_payment.return_value = MOCK_VERIFICATION_VALID
        inst.settle_payment.return_value = MOCK_SETTLEMENT_SUCCESS
        # Async methods (used by FastAPI async middleware)
        inst.aget_payment_requirements = AsyncMock(return_value=MOCK_REQUIREMENTS)
        inst.averify_payment = AsyncMock(return_value=MOCK_VERIFICATION_VALID)
        inst.asettle_payment = AsyncMock(return_value=MOCK_SETTLEMENT_SUCCESS)
        yield inst


def build_app(config):
    fastapi_app = FastAPI()
    add_prism_middleware(fastapi_app, config, ROUTES)

    @fastapi_app.get('/api/premium')
    async def premium(request: Request):
        return {'payer': get_payer(request)}

    @fastapi_app.get('/api/free')
    async def free():
        return {'message': 'free'}

    @fastapi_app.get('/api/decorated')
    @require_payment(price=0.01, description='Decorated route')
    async def decorated(request: Request):
        return {'message': 'decorated ok'}

    return fastapi_app


@pytest.fixture
def fastapi_app(mock_client):
    return build_app(CONFIG)


@pytest.fixture
async def async_client(fastapi_app):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=fastapi_app),
        base_url='http://test'
    ) as client:
        yield client


@pytest.fixture
async def v1_client(mock_client):
    app = build_app(PrismMiddlewareConfig(api_key='test-key', debug=True, allowed_versions=[1, 2]))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url='http://test'
    ) as client:
        yield client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

async def test_free_route_passes_through(async_client):
    resp = await async_client.get('/api/free')
    assert resp.status_code == 200
    assert resp.json()['message'] == 'free'


async def test_protected_no_payment_returns_402(async_client):
    resp = await async_client.get('/api/premium')
    assert resp.status_code == 402


async def test_402_body_contains_requirements(async_client):
    resp = await async_client.get('/api/premium')
    body = resp.json()
    # Body is raw PaymentRequiredResponse (not wrapped under 'payment' key)
    assert 'x402Version' in body or 'amount' in body


async def test_protected_valid_payment_returns_200(async_client):
    resp = await async_client.get('/api/premium', headers={'payment-signature': VALID_HEADER})
    assert resp.status_code == 200


async def test_settlement_called_after_200(async_client, mock_client):
    await async_client.get('/api/premium', headers={'payment-signature': VALID_HEADER})
    mock_client.asettle_payment.assert_called_once()


async def test_settlement_response_header_set(async_client):
    resp = await async_client.get('/api/premium', headers={'payment-signature': VALID_HEADER})
    headers_lower = {k.lower(): v for k, v in resp.headers.items()}
    assert 'payment-response' in headers_lower or 'x-payment-response' in headers_lower


async def test_invalid_payment_returns_402(async_client, mock_client):
    mock_client.averify_payment.return_value = MOCK_VERIFICATION_INVALID
    resp = await async_client.get('/api/premium', headers={'payment-signature': VALID_HEADER})
    assert resp.status_code == 402


async def test_v1_x_payment_header_accepted(v1_client):
    v1_header = make_header({
        'x402Version': 1,
        'scheme': 'exact',
        'network': 'base-sepolia',
        'payload': PAYLOAD,
    })
    resp = await v1_client.get('/api/premium', headers={'x-payment': v1_header})
    assert resp.status_code == 200


async def test_settlement_failure_returns_402(async_client, mock_client):
    mock_client.asettle_payment.return_value = MOCK_SETTLEMENT_FAILURE
    resp = await async_client.get('/api/premium', headers={'payment-signature': VALID_HEADER})
    assert resp.status_code == 402


async def test_requirements_error_returns_500(async_client, mock_client):
    mock_client.aget_payment_requirements.side_effect = Exception('Network error')
    resp = await async_client.get('/api/premium')
    assert resp.status_code == 500


async def test_get_payer_helper_returns_payer(async_client):
    resp = await async_client.get('/api/premium', headers={'payment-signature': VALID_HEADER})
    assert resp.status_code == 200
    assert resp.json().get('payer') == '0xPAYER'


async def test_require_payment_decorator_blocks_without_payment(async_client, mock_client):
    mock_client.aget_payment_requirements.side_effect = Exception('no requirements')
    resp = await async_client.get('/api/decorated')
    assert resp.status_code in (402, 500)


async def test_require_payment_decorator_passes_with_payment(async_client):
    resp = await async_client.get('/api/decorated', headers={'payment-signature': VALID_HEADER})
    assert resp.status_code == 200
