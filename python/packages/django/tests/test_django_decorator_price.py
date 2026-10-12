from __future__ import annotations

import base64
import json
from unittest.mock import AsyncMock, patch

import pytest
from django.http import HttpResponse
from django.test import RequestFactory, override_settings
from django.urls import path, resolve

from prism_django import AsyncPrismPaymentMiddleware, PrismPaymentMiddleware, require_payment

factory = RequestFactory()

CONFIG = {
    'API_KEY': 'test-key',
    'ROUTES': {'/api/*': {'price': 0.01, 'description': 'Cheap API'}},
}

PAYMENT = {
    'x402Version': 2,
    'accepted': {'scheme': 'exact', 'network': 'eip155:84532', 'asset': '0xASSET'},
    'payload': {
        'signature': '0xSIG',
        'authorization': {
            'from': '0xPAYER',
            'to': '0xPAYEE',
            'value': '10000',
            'validAfter': '0',
            'validBefore': '9999999999',
            'nonce': '0x01',
        },
    },
}
PAYMENT_HEADER = base64.b64encode(json.dumps(PAYMENT).encode()).decode()

executed = []


def requirements_for(price):
    return {'accepts': [{'scheme': 'exact', 'network': 'eip155:84532', 'amount': str(price)}]}


def cheap(request):
    executed.append('cheap')
    return HttpResponse('ok')


@require_payment(price=0.05, description='Expensive API')
def expensive(request):
    executed.append('expensive')
    return HttpResponse('ok')


@require_payment(price='$0.05', description='Dollar API')
def dollar(request):
    executed.append('dollar')
    return HttpResponse('ok')


@require_payment(price=0.2, description='Uncovered report')
def report(request):
    executed.append('report')
    return HttpResponse('ok')


def hide_attributes(view):
    def wrapper(request, *args, **kwargs):
        return view(request, *args, **kwargs)
    return wrapper


@hide_attributes
@require_payment(price=0.05, description='Hidden API')
def hidden(request):
    executed.append('hidden')
    return HttpResponse('ok')


urlpatterns = [
    path('api/cheap', cheap),
    path('api/expensive', expensive),
    path('api/dollar', dollar),
    path('api/hidden', hidden),
    path('private/report', report),
]


@pytest.fixture(autouse=True)
def reset_executed():
    executed.clear()


@pytest.fixture
def client_mock():
    with patch('prism_sdk_core.PrismClient') as MockClient:
        inst = MockClient.return_value
        inst.get_payment_requirements.side_effect = (
            lambda resource_url, price, description: requirements_for(price)
        )
        inst.verify_payment.return_value = {'valid': True, 'payer': '0xPAYER'}
        inst.settle_payment.return_value = {'success': True, 'transaction': '0xTX'}
        inst.aget_payment_requirements = AsyncMock(
            side_effect=lambda resource_url, price, description: requirements_for(price)
        )
        inst.averify_payment = AsyncMock(return_value={'valid': True, 'payer': '0xPAYER'})
        inst.asettle_payment = AsyncMock(return_value={'success': True, 'transaction': '0xTX'})
        yield inst


def call_view(request):
    match = resolve(request.path_info)
    return match.func(request, *match.args, **match.kwargs)


def sync_get(url, **extra):
    mw = PrismPaymentMiddleware(call_view)
    return mw(factory.get(url, **extra))


@override_settings(ROOT_URLCONF=__name__, PRISM_CONFIG=CONFIG)
def test_decorator_price_is_requested_verified_and_settled(client_mock):
    response = sync_get('/api/expensive', HTTP_PAYMENT_SIGNATURE=PAYMENT_HEADER)

    assert response.status_code == 200
    assert executed == ['expensive']
    assert client_mock.get_payment_requirements.call_args.kwargs['price'] == 0.05
    assert client_mock.verify_payment.call_args.args[1]['amount'] == '0.05'
    assert client_mock.settle_payment.call_args.args[1]['amount'] == '0.05'


@override_settings(ROOT_URLCONF=__name__, PRISM_CONFIG=CONFIG)
def test_decorator_price_is_advertised_in_the_402(client_mock):
    response = sync_get('/api/expensive')

    assert response.status_code == 402
    assert client_mock.get_payment_requirements.call_args.kwargs['price'] == 0.05
    assert client_mock.get_payment_requirements.call_args.kwargs['description'] == 'Expensive API'
    assert executed == []


@override_settings(ROOT_URLCONF=__name__, PRISM_CONFIG=CONFIG)
def test_string_price_with_currency_symbol_is_enforced(client_mock):
    response = sync_get('/api/dollar', HTTP_PAYMENT_SIGNATURE=PAYMENT_HEADER)

    assert response.status_code == 200
    assert client_mock.get_payment_requirements.call_args.kwargs['price'] == '$0.05'
    assert client_mock.settle_payment.call_args.args[1]['amount'] == '$0.05'


@override_settings(ROOT_URLCONF=__name__, PRISM_CONFIG=CONFIG)
def test_undecorated_view_keeps_middleware_price(client_mock):
    response = sync_get('/api/cheap', HTTP_PAYMENT_SIGNATURE=PAYMENT_HEADER)

    assert response.status_code == 200
    assert client_mock.get_payment_requirements.call_args.kwargs['price'] == 0.01
    assert client_mock.settle_payment.call_args.args[1]['amount'] == '0.01'


@override_settings(ROOT_URLCONF=__name__, PRISM_CONFIG=CONFIG)
def test_decorated_view_outside_middleware_routes_is_charged(client_mock):
    response = sync_get('/private/report', HTTP_PAYMENT_SIGNATURE=PAYMENT_HEADER)

    assert response.status_code == 200
    assert client_mock.get_payment_requirements.call_args.kwargs['price'] == 0.2
    assert client_mock.settle_payment.call_args.args[1]['amount'] == '0.2'


@override_settings(ROOT_URLCONF=__name__, PRISM_CONFIG=CONFIG)
def test_decorated_view_outside_middleware_routes_requires_payment(client_mock):
    response = sync_get('/private/report')

    assert response.status_code == 402
    assert executed == []


@override_settings(ROOT_URLCONF=__name__, PRISM_CONFIG=CONFIG)
def test_price_mismatch_fails_closed_without_running_view_or_settling(client_mock):
    response = sync_get('/api/hidden', HTTP_PAYMENT_SIGNATURE=PAYMENT_HEADER)

    assert response.status_code == 500
    assert executed == []
    client_mock.settle_payment.assert_not_called()


@pytest.mark.asyncio
@override_settings(ROOT_URLCONF=__name__, PRISM_CONFIG=CONFIG)
async def test_async_middleware_enforces_decorator_price(client_mock):
    async def get_response(request):
        return call_view(request)

    mw = AsyncPrismPaymentMiddleware(get_response)
    response = await mw(factory.get('/api/expensive', HTTP_PAYMENT_SIGNATURE=PAYMENT_HEADER))

    assert response.status_code == 200
    assert client_mock.aget_payment_requirements.call_args.kwargs['price'] == 0.05
    assert client_mock.averify_payment.call_args.args[1]['amount'] == '0.05'
    assert client_mock.asettle_payment.call_args.args[1]['amount'] == '0.05'


@pytest.mark.asyncio
@override_settings(ROOT_URLCONF=__name__, PRISM_CONFIG=CONFIG)
async def test_async_middleware_price_mismatch_fails_closed(client_mock):
    async def get_response(request):
        return call_view(request)

    mw = AsyncPrismPaymentMiddleware(get_response)
    response = await mw(factory.get('/api/hidden', HTTP_PAYMENT_SIGNATURE=PAYMENT_HEADER))

    assert response.status_code == 500
    assert executed == []
    client_mock.asettle_payment.assert_not_called()


@pytest.mark.parametrize('bad_price', ['abc', '', None, True, float('nan'), float('inf'), -1, [0.01]])
def test_invalid_decorator_price_is_rejected_at_definition(bad_price):
    with pytest.raises(ValueError):
        require_payment(price=bad_price, description='x')(lambda request: None)
