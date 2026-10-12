from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI, Request

from prism_fastapi import add_prism_middleware, require_payment
from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig
from .payments import header_for, requirements_for

pytestmark = pytest.mark.asyncio

CONFIG = PrismMiddlewareConfig(api_key='test-key')
ROUTES = {'/api/*': RoutePaymentConfig(price=0.01, description='Cheap API')}

def payment_headers(price=None):
    return {'payment-signature': header_for(price)}


PAYMENT_HEADERS = payment_headers()


async def requirements_side_effect(resource_url, price, description):
    return requirements_for(price)


@pytest.fixture
def client_mock():
    with patch('prism_sdk_core.PrismClient') as MockClient:
        inst = MockClient.return_value
        inst.aget_payment_requirements = AsyncMock(side_effect=requirements_side_effect)
        inst.averify_payment = AsyncMock(return_value={'valid': True, 'payer': '0xPAYER'})
        inst.asettle_payment = AsyncMock(return_value={'success': True, 'transaction': '0xTX'})
        yield inst


def build_app():
    app = FastAPI()
    add_prism_middleware(app, CONFIG, ROUTES)
    executed = []

    @app.get('/api/cheap')
    async def cheap(request: Request):
        executed.append('cheap')
        return {'ok': True}

    @app.get('/api/expensive')
    @require_payment(price=0.05, description='Expensive API')
    async def expensive(request: Request):
        executed.append('expensive')
        return {'ok': True}

    @app.get('/api/dollar')
    @require_payment(price='$0.05', description='Dollar API')
    async def dollar(request: Request):
        executed.append('dollar')
        return {'ok': True}

    @app.get('/private/report')
    @require_payment(price=0.2, description='Uncovered report')
    async def report(request: Request):
        executed.append('report')
        return {'ok': True}

    @app.get('/api/versioned')
    async def versioned_read(request: Request):
        executed.append('versioned-read')
        return {'ok': True}

    @app.post('/api/versioned')
    @require_payment(price=0.07, description='Write API')
    async def versioned_write(request: Request):
        executed.append('versioned-write')
        return {'ok': True}

    def hide_attributes(func):
        async def wrapper(request: Request):
            return await func(request=request)
        wrapper.__name__ = func.__name__
        return wrapper

    @app.get('/api/hidden')
    @hide_attributes
    @require_payment(price=0.05, description='Hidden API')
    async def hidden(request: Request):
        executed.append('hidden')
        return {'ok': True}

    app.state.executed = executed
    return app


def client_for(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')


async def test_decorator_price_is_requested_verified_and_settled(client_mock):
    app = build_app()
    async with client_for(app) as client:
        resp = await client.get('/api/expensive', headers=payment_headers(0.05))

    assert resp.status_code == 200
    assert app.state.executed == ['expensive']
    assert client_mock.aget_payment_requirements.call_args.kwargs['price'] == 0.05
    assert client_mock.averify_payment.call_args.args[1]['amount'] == '50000'
    assert client_mock.asettle_payment.call_args.args[1]['amount'] == '50000'


async def test_decorator_price_is_advertised_in_the_402(client_mock):
    app = build_app()
    async with client_for(app) as client:
        resp = await client.get('/api/expensive')

    assert resp.status_code == 402
    assert client_mock.aget_payment_requirements.call_args.kwargs['price'] == 0.05
    assert client_mock.aget_payment_requirements.call_args.kwargs['description'] == 'Expensive API'
    assert app.state.executed == []


async def test_string_price_with_currency_symbol_is_enforced(client_mock):
    app = build_app()
    async with client_for(app) as client:
        resp = await client.get('/api/dollar', headers=payment_headers('$0.05'))

    assert resp.status_code == 200
    assert client_mock.aget_payment_requirements.call_args.kwargs['price'] == '$0.05'
    assert client_mock.asettle_payment.call_args.args[1]['amount'] == '50000'


async def test_undecorated_route_keeps_middleware_price(client_mock):
    app = build_app()
    async with client_for(app) as client:
        resp = await client.get('/api/cheap', headers=PAYMENT_HEADERS)

    assert resp.status_code == 200
    assert client_mock.aget_payment_requirements.call_args.kwargs['price'] == 0.01
    assert client_mock.asettle_payment.call_args.args[1]['amount'] == '10000'


async def test_decorated_route_outside_middleware_routes_is_charged(client_mock):
    app = build_app()
    async with client_for(app) as client:
        resp = await client.get('/private/report', headers=payment_headers(0.2))

    assert resp.status_code == 200
    assert client_mock.aget_payment_requirements.call_args.kwargs['price'] == 0.2
    assert client_mock.asettle_payment.call_args.args[1]['amount'] == '200000'


async def test_decorated_route_outside_middleware_routes_requires_payment(client_mock):
    app = build_app()
    async with client_for(app) as client:
        resp = await client.get('/private/report')

    assert resp.status_code == 402
    assert app.state.executed == []


async def test_decorator_price_follows_the_http_method(client_mock):
    app = build_app()
    async with client_for(app) as client:
        read = await client.get('/api/versioned', headers=PAYMENT_HEADERS)
        write = await client.post('/api/versioned', headers=payment_headers(0.07))

    assert read.status_code == 200
    assert write.status_code == 200
    prices = [call.kwargs['price'] for call in client_mock.aget_payment_requirements.call_args_list]
    assert prices == [0.01, 0.07]
    assert app.state.executed == ['versioned-read', 'versioned-write']


async def test_price_mismatch_fails_closed_without_running_route_or_settling(client_mock):
    app = build_app()
    async with client_for(app) as client:
        resp = await client.get('/api/hidden', headers=PAYMENT_HEADERS)

    assert resp.status_code == 500
    assert app.state.executed == []
    client_mock.asettle_payment.assert_not_called()


@pytest.mark.parametrize('bad_price', ['abc', '', None, True, float('nan'), float('inf'), -1, [0.01]])
async def test_invalid_decorator_price_is_rejected_at_definition(bad_price):
    async def endpoint(request: Request):
        return None

    with pytest.raises(ValueError):
        require_payment(price=bad_price, description='x')(endpoint)


async def test_decorated_endpoint_keeps_function_metadata():
    @require_payment(price=0.05, description='x')
    async def named_endpoint(request: Request):
        return 'ok'

    assert named_endpoint.__name__ == 'named_endpoint'
