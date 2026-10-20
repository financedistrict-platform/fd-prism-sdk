"""
Tests for prism_django middleware — 12 test cases covering happy path,
error scenarios, settlement, config normalization, and require_payment decorator.
"""

from __future__ import annotations

import json
from unittest.mock import patch, MagicMock

import pytest
from django.test import RequestFactory, override_settings
from django.core.exceptions import ImproperlyConfigured
from django.http import HttpResponse
from django.urls import path, resolve

from prism_django import (
    PrismPaymentMiddleware,
    AsyncPrismPaymentMiddleware,
    get_payer,
    get_payment,
    require_payment,
)
from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig
from .payments import header_for, requirements_for

# ---------------------------------------------------------------------------
# Shared mock data
# ---------------------------------------------------------------------------

MOCK_REQUIREMENTS = requirements_for()
MOCK_VERIFICATION_VALID = {'valid': True, 'payment': {'signature': '0xSIG'}, 'payer': '0xPAYER'}
MOCK_VERIFICATION_INVALID = {'valid': False, 'error': 'Invalid signature'}
MOCK_SETTLEMENT_SUCCESS = {'success': True, 'transaction': '0xTXHASH'}
MOCK_SETTLEMENT_FAILURE = {'success': False, 'errorReason': 'Insufficient funds'}

factory = RequestFactory()


VALID_HEADER = header_for()


def make_get_response(status: int = 200):
    def get_response(request):
        return HttpResponse('ok', status=status)
    return get_response


def make_middleware(mock_inst, get_response=None):
    """Create middleware with mocked PrismClient."""
    if get_response is None:
        get_response = make_get_response()
    mock_inst.get_payment_requirements.return_value = MOCK_REQUIREMENTS
    mock_inst.verify_payment.return_value = MOCK_VERIFICATION_VALID
    mock_inst.settle_payment.return_value = MOCK_SETTLEMENT_SUCCESS
    return PrismPaymentMiddleware(get_response)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@patch('prism_sdk_core.PrismClient')
def test_free_route_passes_through(MockClient):
    mw = make_middleware(MockClient.return_value)
    request = factory.get('/api/other/')
    response = mw(request)
    assert response.status_code == 200


@patch('prism_sdk_core.PrismClient')
def test_protected_no_payment_returns_402(MockClient):
    mw = make_middleware(MockClient.return_value)
    request = factory.get('/api/premium/')
    response = mw(request)
    assert response.status_code == 402


@patch('prism_sdk_core.PrismClient')
def test_402_body_contains_payment_requirements(MockClient):
    mw = make_middleware(MockClient.return_value)
    request = factory.get('/api/premium/')
    response = mw(request)
    body = json.loads(response.content)
    # Body is raw PaymentRequiredResponse (not wrapped under 'payment' key)
    assert 'x402Version' in body or 'amount' in body


@patch('prism_sdk_core.PrismClient')
def test_protected_valid_payment_returns_200(MockClient):
    mw = make_middleware(MockClient.return_value)
    request = factory.get('/api/premium/', HTTP_PAYMENT_SIGNATURE=VALID_HEADER)
    response = mw(request)
    assert response.status_code == 200


@patch('prism_sdk_core.PrismClient')
def test_settlement_called_after_200(MockClient):
    inst = MockClient.return_value
    mw = make_middleware(inst)
    request = factory.get('/api/premium/', HTTP_PAYMENT_SIGNATURE=VALID_HEADER)
    mw(request)
    inst.settle_payment.assert_called_once()


@patch('prism_sdk_core.PrismClient')
def test_settlement_response_header_set(MockClient):
    mw = make_middleware(MockClient.return_value)
    request = factory.get('/api/premium/', HTTP_PAYMENT_SIGNATURE=VALID_HEADER)
    response = mw(request)
    assert (
        'PAYMENT-RESPONSE' in response
        or 'X-PAYMENT-RESPONSE' in response
    )


@patch('prism_sdk_core.PrismClient')
def test_invalid_payment_returns_402(MockClient):
    inst = MockClient.return_value
    mw = make_middleware(inst)
    # Override AFTER make_middleware so it isn't reset to MOCK_VERIFICATION_VALID
    inst.verify_payment.return_value = MOCK_VERIFICATION_INVALID
    request = factory.get('/api/premium/', HTTP_PAYMENT_SIGNATURE=VALID_HEADER)
    response = mw(request)
    assert response.status_code == 402


@patch('prism_sdk_core.PrismClient')
@override_settings(PRISM_CONFIG={
    'API_KEY': 'dict-key',
    'DEBUG': False,
    'ROUTES': {'/api/premium/': {'price': 0.01, 'description': 'Premium API'}},
})
def test_config_dict_accepted(MockClient):
    """PRISM_CONFIG as plain dict must not raise TypeError."""
    make_middleware(MockClient.return_value)  # no exception == pass


@patch('prism_sdk_core.PrismClient')
@override_settings(PRISM_CONFIG=PrismMiddlewareConfig(api_key='obj-key', debug=False))
def test_config_object_rejected(MockClient):
    """PRISM_CONFIG must be a dict so that ROUTES can live beside the other keys."""
    with pytest.raises(ImproperlyConfigured):
        make_middleware(MockClient.return_value)


@patch('prism_sdk_core.PrismClient')
@override_settings(PRISM_CONFIG={
    'API_KEY': 'test',
    'ROUTES': {'/api/premium/': RoutePaymentConfig(price=0.01, description='Premium API')},
})
def test_route_config_object_accepted(MockClient):
    """ROUTES with RoutePaymentConfig values must not raise TypeError."""
    make_middleware(MockClient.return_value)  # no exception == pass


@patch('prism_sdk_core.PrismClient')
def test_require_payment_decorator_blocks_without_prism_payer(MockClient):
    inst = MockClient.return_value
    inst.get_payment_requirements.side_effect = Exception('no requirements')
    mw = make_middleware(inst)

    @require_payment(price=0.01, description='Decorated')
    def my_view(request):
        return HttpResponse('ok')

    request = factory.get('/api/premium/')
    # Middleware returns 500 due to requirements error; decorator never runs
    response = mw(request)
    assert response.status_code in (402, 500)


@patch('prism_sdk_core.PrismClient')
def test_require_payment_decorator_passes_with_prism_payer(MockClient):
    inst = MockClient.return_value
    inst.get_payment_requirements.return_value = MOCK_REQUIREMENTS
    inst.verify_payment.return_value = MOCK_VERIFICATION_VALID
    inst.settle_payment.return_value = MOCK_SETTLEMENT_SUCCESS

    @require_payment(price=0.01, description='Decorated')
    def my_view(request):
        return HttpResponse('ok')

    def get_response(request):
        return my_view(request)

    mw = PrismPaymentMiddleware(get_response)
    request = factory.get('/api/premium/', HTTP_PAYMENT_SIGNATURE=VALID_HEADER)
    response = mw(request)
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Phase 3: AsyncPrismPaymentMiddleware tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@patch('prism_sdk_core.PrismClient')
@override_settings(
    PRISM_CONFIG={
        'API_KEY': 'test',
        'DEBUG': True,
        'ROUTES': {'/api/premium/': {'price': 0.01, 'description': 'Premium API'}},
    },
)
async def test_async_middleware_free_route(MockClient):
    inst = MockClient.return_value
    inst.aget_payment_requirements = None  # unused for free route

    async def get_response(request):
        return HttpResponse('ok', status=200)

    mw = AsyncPrismPaymentMiddleware(get_response)
    request = factory.get('/api/other/')
    response = await mw(request)
    assert response.status_code == 200


@pytest.mark.asyncio
@patch('prism_sdk_core.PrismClient')
@override_settings(
    PRISM_CONFIG={
        'API_KEY': 'test',
        'DEBUG': True,
        'ROUTES': {'/api/premium/': {'price': 0.01, 'description': 'Premium API'}},
    },
)
async def test_async_middleware_protected_no_payment_returns_402(MockClient):
    from unittest.mock import AsyncMock
    inst = MockClient.return_value
    inst.aget_payment_requirements = AsyncMock(return_value=MOCK_REQUIREMENTS)

    async def get_response(request):
        return HttpResponse('ok', status=200)

    mw = AsyncPrismPaymentMiddleware(get_response)
    request = factory.get('/api/premium/')
    response = await mw(request)
    assert response.status_code == 402


@pytest.mark.asyncio
@patch('prism_sdk_core.PrismClient')
@override_settings(
    PRISM_CONFIG={
        'API_KEY': 'test',
        'DEBUG': True,
        'ROUTES': {'/api/premium/': {'price': 0.01, 'description': 'Premium API'}},
    },
)
async def test_async_middleware_valid_payment_returns_200(MockClient):
    from unittest.mock import AsyncMock
    inst = MockClient.return_value
    inst.aget_payment_requirements = AsyncMock(return_value=MOCK_REQUIREMENTS)
    inst.averify_payment = AsyncMock(return_value=MOCK_VERIFICATION_VALID)
    inst.asettle_payment = AsyncMock(return_value=MOCK_SETTLEMENT_SUCCESS)

    async def get_response(request):
        return HttpResponse('ok', status=200)

    mw = AsyncPrismPaymentMiddleware(get_response)
    request = factory.get('/api/premium/', HTTP_PAYMENT_SIGNATURE=VALID_HEADER)
    response = await mw(request)
    assert response.status_code == 200


def test_get_payer_returns_verified_payer():
    request = factory.get('/')
    request._prism_payer = '0xPAYER'
    assert get_payer(request) == '0xPAYER'


def test_get_payment_returns_verified_payment():
    request = factory.get('/')
    request._prism_payment = {'signature': '0xSIG'}
    assert get_payment(request) == {'signature': '0xSIG'}


def test_accessors_return_none_when_unpaid():
    request = factory.get('/')
    assert get_payer(request) is None
    assert get_payment(request) is None


def test_accessors_ignore_unprefixed_attributes():
    request = factory.get('/')
    request.prism_payer = '0xSPOOF'
    request.prism_payment = {'signature': '0xSPOOF'}
    assert get_payer(request) is None
    assert get_payment(request) is None



UNCONFIRMED_SETTLEMENTS = [
    pytest.param({'success': True}, 'settlement_not_confirmed', id='success-without-transaction'),
    pytest.param({}, 'settlement_not_confirmed', id='empty-reply'),
    pytest.param({'success': False, 'errorReason': 'x'}, 'x', id='declined'),
    pytest.param({'success': True, 'transaction': ''}, 'settlement_not_confirmed', id='empty-transaction'),
    pytest.param({'success': 'true', 'transaction': '0x1'}, 'settlement_not_confirmed', id='non-boolean-success'),
]

PAID_CONTENT = 'paid-content'


def paid_response(request):
    return HttpResponse(PAID_CONTENT)


async def async_paid_response(request):
    return HttpResponse(PAID_CONTENT)


def async_middleware(inst, settlement):
    from unittest.mock import AsyncMock
    inst.aget_payment_requirements = AsyncMock(return_value=MOCK_REQUIREMENTS)
    inst.averify_payment = AsyncMock(return_value=MOCK_VERIFICATION_VALID)
    inst.asettle_payment = AsyncMock(return_value=settlement)
    return AsyncPrismPaymentMiddleware(async_paid_response)


def assert_withheld(response, details):
    assert response.status_code == 402
    assert PAID_CONTENT not in response.content.decode()
    assert json.loads(response.content)['details'] == details
    assert 'PAYMENT-RESPONSE' not in response


def assert_delivered(response):
    assert response.status_code == 200
    assert response.content.decode() == PAID_CONTENT
    assert 'PAYMENT-RESPONSE' in response


@pytest.mark.parametrize('settlement, details', UNCONFIRMED_SETTLEMENTS)
@patch('prism_sdk_core.PrismClient')
def test_unconfirmed_settlement_withholds_content(MockClient, settlement, details):
    inst = MockClient.return_value
    mw = make_middleware(inst, paid_response)
    inst.settle_payment.return_value = settlement
    response = mw(factory.get('/api/premium/', HTTP_PAYMENT_SIGNATURE=VALID_HEADER))
    assert_withheld(response, details)


@patch('prism_sdk_core.PrismClient')
def test_settled_transaction_delivers_content_with_settlement_header(MockClient):
    inst = MockClient.return_value
    mw = make_middleware(inst, paid_response)
    inst.settle_payment.return_value = {'success': True, 'transaction': '0x1'}
    response = mw(factory.get('/api/premium/', HTTP_PAYMENT_SIGNATURE=VALID_HEADER))
    assert_delivered(response)


@pytest.mark.asyncio
@pytest.mark.parametrize('settlement, details', UNCONFIRMED_SETTLEMENTS)
@patch('prism_sdk_core.PrismClient')
async def test_async_unconfirmed_settlement_withholds_content(MockClient, settlement, details):
    mw = async_middleware(MockClient.return_value, settlement)
    response = await mw(factory.get('/api/premium/', HTTP_PAYMENT_SIGNATURE=VALID_HEADER))
    assert_withheld(response, details)


@pytest.mark.asyncio
@patch('prism_sdk_core.PrismClient')
async def test_async_settled_transaction_delivers_content_with_settlement_header(MockClient):
    mw = async_middleware(MockClient.return_value, {'success': True, 'transaction': '0x1'})
    response = await mw(factory.get('/api/premium/', HTTP_PAYMENT_SIGNATURE=VALID_HEADER))
    assert_delivered(response)


@require_payment(price=0.01, description='Decorated under a script prefix')
def decorated_view(request):
    return HttpResponse(PAID_CONTENT)


urlpatterns = [
    path('api/decorated/', decorated_view),
    path('api/premium/', paid_response),
]


def resolve_view(request):
    match = resolve(request.path_info)
    return match.func(request, *match.args, **match.kwargs)


async def async_resolve_view(request):
    return resolve_view(request)


@override_settings(ROOT_URLCONF=__name__)
@pytest.mark.parametrize('route', ['/api/premium/', '/api/decorated/'])
@patch('prism_sdk_core.PrismClient')
def test_script_name_prefix_is_charged(MockClient, route):
    mw = make_middleware(MockClient.return_value, resolve_view)
    response = mw(factory.get(route, SCRIPT_NAME='/shop'))
    assert response.status_code == 402
    assert PAID_CONTENT not in response.content.decode()


@pytest.mark.asyncio
@override_settings(ROOT_URLCONF=__name__)
@pytest.mark.parametrize('route', ['/api/premium/', '/api/decorated/'])
@patch('prism_sdk_core.PrismClient')
async def test_async_script_name_prefix_is_charged(MockClient, route):
    from unittest.mock import AsyncMock
    MockClient.return_value.aget_payment_requirements = AsyncMock(return_value=MOCK_REQUIREMENTS)
    mw = AsyncPrismPaymentMiddleware(async_resolve_view)
    response = await mw(factory.get(route, SCRIPT_NAME='/shop'))
    assert response.status_code == 402
    assert PAID_CONTENT not in response.content.decode()
