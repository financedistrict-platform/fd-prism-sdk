from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.http import HttpResponse
from django.test import RequestFactory, override_settings

from prism_django import AsyncPrismPaymentMiddleware, PrismPaymentMiddleware

factory = RequestFactory()

MOCK_REQUIREMENTS = {
    'x402Version': 2,
    'amount': '1000000',
    'network': 'eip155:84532',
    'paymentAddress': '0xTEST',
    'accepted': [{'url': 'http://testserver/api/data/users', 'description': 'Data API'}],
}

PREMIUM_ROUTE = {'/api/premium/': {'price': 0.01, 'description': 'Premium API'}}

WILDCARD_CONFIG = {
    'API_KEY': 'test-key',
    'BASE_URL': 'https://prism.example.test',
    'DEBUG': True,
    'ROUTES': {
        **PREMIUM_ROUTE,
        '/api/data/*': {'price': 0.005, 'description': 'Data API'},
    },
}


def ok_response(request):
    return HttpResponse('ok')


def build_sync(mock_inst):
    mock_inst.get_payment_requirements.return_value = MOCK_REQUIREMENTS
    return PrismPaymentMiddleware(ok_response)


@pytest.mark.parametrize('path', ['/api/data/users', '/api/data/users/42', '/api/data'])
@patch('prism_sdk_core.PrismClient')
@override_settings(PRISM_CONFIG=WILDCARD_CONFIG)
def test_wildcard_route_requires_payment(MockClient, path):
    mw = build_sync(MockClient.return_value)
    assert mw(factory.get(path)).status_code == 402


@pytest.mark.parametrize('path', ['/api/database', '/api/data-v2/users', '/api/free/'])
@patch('prism_sdk_core.PrismClient')
@override_settings(PRISM_CONFIG=WILDCARD_CONFIG)
def test_paths_outside_wildcard_are_not_charged(MockClient, path):
    mw = build_sync(MockClient.return_value)
    assert mw(factory.get(path)).status_code == 200


@pytest.mark.asyncio
@patch('prism_sdk_core.PrismClient')
@override_settings(PRISM_CONFIG=WILDCARD_CONFIG)
async def test_wildcard_route_requires_payment_async(MockClient):
    MockClient.return_value.aget_payment_requirements = AsyncMock(return_value=MOCK_REQUIREMENTS)

    async def get_response(request):
        return HttpResponse('ok')

    mw = AsyncPrismPaymentMiddleware(get_response)
    response = await mw(factory.get('/api/data/users'))
    assert response.status_code == 402


@patch('prism_sdk_core.PrismClient')
@override_settings(PRISM_CONFIG=WILDCARD_CONFIG)
def test_config_keys_are_applied(MockClient):
    mw = build_sync(MockClient.return_value)
    assert mw.config.api_key == 'test-key'
    assert mw.config.base_url == 'https://prism.example.test'
    assert mw.config.debug is True
    assert set(mw.core.routes) == {'/api/premium/', '/api/data/*'}


@patch('prism_sdk_core.PrismClient')
@override_settings(PRISM_CONFIG={
    'API_KEY': 'k',
    'TIMEOUT': 5,
    'X402_VERSION': 1,
    'ROUTES': PREMIUM_ROUTE,
})
def test_optional_keys_are_applied(MockClient):
    mw = build_sync(MockClient.return_value)
    assert mw.config.timeout == 5
    assert mw.config.x402_version == 1


@pytest.mark.parametrize('middleware_cls', [PrismPaymentMiddleware, AsyncPrismPaymentMiddleware])
@pytest.mark.parametrize('bad_config', [
    {'api_key': 'k', 'routes': PREMIUM_ROUTE},
    {'API_KEY': 'k', 'ROUTES': PREMIUM_ROUTE, 'ROUTE': {}},
    {'API_KEY': 'k', 'debug': True, 'ROUTES': PREMIUM_ROUTE},
    {'API_KEY': 'k'},
    {'ROUTES': PREMIUM_ROUTE},
    {'API_KEY': '', 'ROUTES': PREMIUM_ROUTE},
    {'API_KEY': 'k', 'ROUTES': []},
    {'API_KEY': 'k', 'ROUTES': {'/api/*/x': {'price': 0.01, 'description': 'x'}}},
    {'API_KEY': 'k', 'ROUTES': {'/api/premium/': {'price': 0.01, 'descripton': 'x'}}},
    {'API_KEY': 'k', 'ROUTES': {'/api/premium/': 0.01}},
])
@patch('prism_sdk_core.PrismClient')
def test_invalid_config_fails_closed(MockClient, bad_config, middleware_cls):
    with override_settings(PRISM_CONFIG=bad_config):
        with pytest.raises(ImproperlyConfigured):
            middleware_cls(ok_response)


@pytest.mark.parametrize('middleware_cls', [PrismPaymentMiddleware, AsyncPrismPaymentMiddleware])
@pytest.mark.parametrize('bad_value', [None, 'nope', []])
@patch('prism_sdk_core.PrismClient')
def test_non_dict_prism_config_fails_closed(MockClient, bad_value, middleware_cls):
    with override_settings(PRISM_CONFIG=bad_value):
        with pytest.raises(ImproperlyConfigured):
            middleware_cls(ok_response)


@pytest.mark.parametrize('middleware_cls', [PrismPaymentMiddleware, AsyncPrismPaymentMiddleware])
@patch('prism_sdk_core.PrismClient')
def test_prism_routes_setting_fails_closed(MockClient, middleware_cls):
    with override_settings(
        PRISM_CONFIG=WILDCARD_CONFIG,
        PRISM_ROUTES={'/api/old/': {'price': 0.01, 'description': 'x'}},
    ):
        with pytest.raises(ImproperlyConfigured):
            middleware_cls(ok_response)
