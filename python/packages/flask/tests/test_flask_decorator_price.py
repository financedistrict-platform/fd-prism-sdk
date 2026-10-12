from __future__ import annotations

from unittest.mock import patch

import pytest
from flask import Flask

from prism_flask import prism_payment_middleware, require_payment
from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig
from .payments import header_for, requirements_for

CONFIG = PrismMiddlewareConfig(api_key='test-key')
ROUTES = {'/api/*': RoutePaymentConfig(price=0.01, description='Cheap API')}

PAYMENT_HEADER = header_for()


@pytest.fixture
def client_mock():
    with patch('prism_sdk_core.PrismClient') as MockClient:
        inst = MockClient.return_value
        inst.get_payment_requirements.side_effect = (
            lambda resource_url, price, description: requirements_for(price)
        )
        inst.verify_payment.return_value = {'valid': True, 'payer': '0xPAYER'}
        inst.settle_payment.return_value = {'success': True, 'transaction': '0xTX'}
        yield inst


def build_app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    prism_payment_middleware(app, CONFIG, ROUTES)
    executed = []

    @app.route('/api/cheap')
    def cheap():
        executed.append('cheap')
        return {'ok': True}

    @app.route('/api/expensive')
    @require_payment(price=0.05, description='Expensive API')
    def expensive():
        executed.append('expensive')
        return {'ok': True}

    @app.route('/api/dollar')
    @require_payment(price='$0.05', description='Dollar API')
    def dollar():
        executed.append('dollar')
        return {'ok': True}

    @app.route('/private/report')
    @require_payment(price=0.2, description='Uncovered report')
    def report():
        executed.append('report')
        return {'ok': True}

    def hide_attributes(func):
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        wrapper.__name__ = func.__name__
        return wrapper

    @app.route('/api/hidden')
    @hide_attributes
    @require_payment(price=0.05, description='Hidden API')
    def hidden():
        executed.append('hidden')
        return {'ok': True}

    app.executed = executed
    return app


def test_decorator_price_is_requested_verified_and_settled(client_mock):
    app = build_app()
    resp = app.test_client().get('/api/expensive', headers={'PAYMENT-SIGNATURE': header_for(0.05)})

    assert resp.status_code == 200
    assert app.executed == ['expensive']
    assert client_mock.get_payment_requirements.call_args.kwargs['price'] == 0.05
    assert client_mock.verify_payment.call_args.args[1]['amount'] == '50000'
    assert client_mock.settle_payment.call_args.args[1]['amount'] == '50000'


def test_decorator_price_is_advertised_in_the_402(client_mock):
    app = build_app()
    resp = app.test_client().get('/api/expensive')

    assert resp.status_code == 402
    assert client_mock.get_payment_requirements.call_args.kwargs['price'] == 0.05
    assert client_mock.get_payment_requirements.call_args.kwargs['description'] == 'Expensive API'
    assert app.executed == []


def test_string_price_with_currency_symbol_is_enforced(client_mock):
    app = build_app()
    resp = app.test_client().get('/api/dollar', headers={'PAYMENT-SIGNATURE': header_for('$0.05')})

    assert resp.status_code == 200
    assert client_mock.get_payment_requirements.call_args.kwargs['price'] == '$0.05'
    assert client_mock.settle_payment.call_args.args[1]['amount'] == '50000'


def test_undecorated_route_keeps_middleware_price(client_mock):
    app = build_app()
    resp = app.test_client().get('/api/cheap', headers={'PAYMENT-SIGNATURE': PAYMENT_HEADER})

    assert resp.status_code == 200
    assert client_mock.get_payment_requirements.call_args.kwargs['price'] == 0.01
    assert client_mock.settle_payment.call_args.args[1]['amount'] == '10000'


def test_decorated_view_outside_middleware_routes_is_charged(client_mock):
    app = build_app()
    resp = app.test_client().get('/private/report', headers={'PAYMENT-SIGNATURE': header_for(0.2)})

    assert resp.status_code == 200
    assert client_mock.get_payment_requirements.call_args.kwargs['price'] == 0.2
    assert client_mock.settle_payment.call_args.args[1]['amount'] == '200000'


def test_decorated_view_outside_middleware_routes_requires_payment(client_mock):
    app = build_app()
    resp = app.test_client().get('/private/report')

    assert resp.status_code == 402
    assert app.executed == []


def test_price_mismatch_fails_closed_without_running_view_or_settling(client_mock):
    app = build_app()
    resp = app.test_client().get('/api/hidden', headers={'PAYMENT-SIGNATURE': PAYMENT_HEADER})

    assert resp.status_code == 500
    assert app.executed == []
    client_mock.settle_payment.assert_not_called()


@pytest.mark.parametrize('bad_price', ['abc', '', None, True, float('nan'), float('inf'), -1, [0.01]])
def test_invalid_decorator_price_is_rejected_at_definition(bad_price):
    with pytest.raises(ValueError):
        require_payment(price=bad_price, description='x')(lambda: None)


def test_decorated_view_keeps_function_metadata():
    @require_payment(price=0.05, description='x')
    def named_view():
        return 'ok'

    assert named_view.__name__ == 'named_view'
