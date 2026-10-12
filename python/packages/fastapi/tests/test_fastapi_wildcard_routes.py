from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI

from prism_fastapi import PrismPaymentMiddleware, add_prism_middleware
from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig

pytestmark = pytest.mark.asyncio

CONFIG = PrismMiddlewareConfig(api_key='test-key', debug=True)
MOCK_REQUIREMENTS = {
    'x402Version': 2,
    'amount': '1000000',
    'network': 'eip155:84532',
    'paymentAddress': '0xTEST',
    'accepted': [{'url': 'http://test/api/data/users', 'description': 'Data API'}],
}


def build_app(routes):
    app = FastAPI()
    add_prism_middleware(app, CONFIG, routes)

    @app.get('/api/data/{rest:path}')
    async def data(rest: str):
        return {'data': rest}

    @app.get('/api/database')
    async def database():
        return {'data': 'db'}

    return app


def client_for(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')


@pytest.fixture
def mock_client():
    with patch('prism_sdk_core.PrismClient') as MockClient:
        MockClient.return_value.aget_payment_requirements = AsyncMock(return_value=MOCK_REQUIREMENTS)
        yield MockClient.return_value


@pytest.mark.parametrize('path', ['/api/data/users', '/api/data/users/42'])
async def test_wildcard_route_requires_payment(mock_client, path):
    app = build_app({'/api/data/*': RoutePaymentConfig(price=0.005, description='Data API')})
    async with client_for(app) as client:
        assert (await client.get(path)).status_code == 402


async def test_path_outside_wildcard_is_not_charged(mock_client):
    app = build_app({'/api/data/*': RoutePaymentConfig(price=0.005, description='Data API')})
    async with client_for(app) as client:
        assert (await client.get('/api/database')).status_code == 200


async def test_dict_route_values_are_accepted(mock_client):
    app = build_app({'/api/data/*': {'price': 0.005, 'description': 'Data API'}})
    async with client_for(app) as client:
        assert (await client.get('/api/data/users')).status_code == 402


@pytest.mark.parametrize('routes', [
    {'/api/data/*': {'price': 0.005, 'description': 'Data API', 'prise': 1}},
    {'/api/data/*': {'price': 0.005}},
    {'/api/*/data': RoutePaymentConfig(price=0.005, description='Data API')},
    {'/api/data*': RoutePaymentConfig(price=0.005, description='Data API')},
    {'/api/data/*': 0.005},
])
async def test_invalid_routes_fail_at_setup(mock_client, routes):
    with pytest.raises(ValueError):
        add_prism_middleware(FastAPI(), CONFIG, routes)
    with pytest.raises(ValueError):
        PrismPaymentMiddleware(FastAPI(), CONFIG, routes)
