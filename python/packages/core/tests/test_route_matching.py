from __future__ import annotations

from unittest.mock import patch

import pytest

from prism_sdk_core import PrismMiddlewareConfig, PrismMiddlewareCore, RoutePaymentConfig

CONFIG = PrismMiddlewareConfig(api_key='test-key')
PRICE = RoutePaymentConfig(price=0.005, description='Data API')
OTHER = RoutePaymentConfig(price=0.01, description='Premium API')

MOCK_REQUIREMENTS = {
    'x402Version': 2,
    'amount': '1000000',
    'network': 'eip155:84532',
    'paymentAddress': '0xTEST',
    'accepted': [{'url': 'http://localhost/api/data/users', 'description': 'Data API'}],
}


@pytest.fixture
def mock_client():
    with patch('prism_sdk_core.PrismClient') as MockClient:
        inst = MockClient.return_value
        inst.get_payment_requirements.return_value = MOCK_REQUIREMENTS
        yield inst


def make_core(routes, mock_client):
    return PrismMiddlewareCore(CONFIG, routes)


@pytest.mark.parametrize('path', [
    '/api/data/users',
    '/api/data/users/42',
    '/api/data/a/b/c/d',
    '/api/data',
    '/api/data/',
])
def test_wildcard_matches_path_below_prefix(path, mock_client):
    core = make_core({'/api/data/*': PRICE}, mock_client)
    assert core.find_matching_route(path) is PRICE


@pytest.mark.parametrize('path', [
    '/api/database',
    '/api/data-v2/users',
    '/api/dat',
    '/api',
    '/other/api/data/users',
    '/',
])
def test_wildcard_respects_segment_boundary(path, mock_client):
    core = make_core({'/api/data/*': PRICE}, mock_client)
    assert core.find_matching_route(path) is None


def test_root_wildcard_matches_every_path(mock_client):
    core = make_core({'/*': PRICE}, mock_client)
    assert core.find_matching_route('/anything/at/all') is PRICE
    assert core.find_matching_route('/') is PRICE


def test_exact_route_still_matches_and_keeps_segment_boundary(mock_client):
    core = make_core({'/api/premium': OTHER}, mock_client)
    assert core.find_matching_route('/api/premium') is OTHER
    assert core.find_matching_route('/api/premium/sub') is OTHER
    assert core.find_matching_route('/api/premium-v2') is None


def test_trailing_slash_route_also_covers_bare_path(mock_client):
    core = make_core({'/api/premium/': OTHER}, mock_client)
    assert core.find_matching_route('/api/premium') is OTHER
    assert core.find_matching_route('/api/premium/x') is OTHER


def test_exact_route_wins_over_wildcard(mock_client):
    core = make_core({'/api/data/*': PRICE, '/api/data/special': OTHER}, mock_client)
    assert core.find_matching_route('/api/data/special') is OTHER


def test_wildcard_route_requires_payment_sync(mock_client):
    core = make_core({'/api/data/*': PRICE}, mock_client)
    result = core.handle_request('/api/data/users', 'http://localhost/api/data/users')
    assert result.handled is True
    assert result.status_code == 402


@pytest.mark.asyncio
async def test_wildcard_route_requires_payment_async(mock_client):
    from unittest.mock import AsyncMock
    mock_client.aget_payment_requirements = AsyncMock(return_value=MOCK_REQUIREMENTS)
    core = make_core({'/api/data/*': PRICE}, mock_client)
    result = await core.ahandle_request('/api/data/users', 'http://localhost/api/data/users')
    assert result.handled is True
    assert result.status_code == 402


def test_unprotected_path_passes_through_sync(mock_client):
    core = make_core({'/api/data/*': PRICE}, mock_client)
    result = core.handle_request('/api/database', 'http://localhost/api/database')
    assert result.handled is False


@pytest.mark.parametrize('pattern', [
    '/api/*/users',
    '/api*',
    '/api/data*',
    '*',
    '/api/**',
    '/api/*/',
    '/*/*',
    'api/data',
    '',
])
def test_invalid_route_pattern_is_rejected(pattern, mock_client):
    with pytest.raises(ValueError):
        PrismMiddlewareCore(CONFIG, {pattern: PRICE})


def test_dict_route_value_is_converted(mock_client):
    core = PrismMiddlewareCore(CONFIG, {'/api/data/*': {'price': 0.005, 'description': 'Data API'}})
    matched = core.find_matching_route('/api/data/users')
    assert isinstance(matched, RoutePaymentConfig)
    assert matched.price == 0.005
    assert matched.description == 'Data API'


@pytest.mark.parametrize('value', [
    {'price': 0.005, 'description': 'Data API', 'prise': 1},
    {'price': 0.005},
    {'description': 'Data API'},
    'cheap',
    None,
    0.005,
])
def test_invalid_route_value_is_rejected(value, mock_client):
    with pytest.raises(ValueError):
        PrismMiddlewareCore(CONFIG, {'/api/data/*': value})
