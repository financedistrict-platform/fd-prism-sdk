from __future__ import annotations

from unittest.mock import patch

import pytest
from flask import Flask

from prism_flask import prism_payment_middleware
from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig

CONFIG = PrismMiddlewareConfig(api_key='test-key', debug=True)
MOCK_REQUIREMENTS = {
    'x402Version': 2,
    'amount': '1000000',
    'network': 'eip155:84532',
    'paymentAddress': '0xTEST',
    'accepted': [{'url': 'http://localhost/api/data/users', 'description': 'Data API'}],
}


def build_client(routes):
    app = Flask(__name__)
    app.config['TESTING'] = True
    prism_payment_middleware(app, CONFIG, routes)

    @app.route('/api/data/<path:rest>')
    def data(rest):
        return {'data': rest}

    @app.route('/api/database')
    def database():
        return {'data': 'db'}

    return app.test_client()


@pytest.fixture
def mock_client():
    with patch('prism_sdk_core.PrismClient') as MockClient:
        MockClient.return_value.get_payment_requirements.return_value = MOCK_REQUIREMENTS
        yield MockClient.return_value


@pytest.mark.parametrize('path', ['/api/data/users', '/api/data/users/42'])
def test_wildcard_route_requires_payment(mock_client, path):
    client = build_client({'/api/data/*': RoutePaymentConfig(price=0.005, description='Data API')})
    assert client.get(path).status_code == 402


def test_path_outside_wildcard_is_not_charged(mock_client):
    client = build_client({'/api/data/*': RoutePaymentConfig(price=0.005, description='Data API')})
    assert client.get('/api/database').status_code == 200


def test_dict_route_values_are_accepted(mock_client):
    client = build_client({'/api/data/*': {'price': 0.005, 'description': 'Data API'}})
    assert client.get('/api/data/users').status_code == 402


@pytest.mark.parametrize('routes', [
    {'/api/data/*': {'price': 0.005, 'description': 'Data API', 'prise': 1}},
    {'/api/data/*': {'price': 0.005}},
    {'/api/*/data': RoutePaymentConfig(price=0.005, description='Data API')},
    {'/api/data*': RoutePaymentConfig(price=0.005, description='Data API')},
    {'/api/data/*': 0.005},
])
def test_invalid_routes_fail_at_setup(mock_client, routes):
    with pytest.raises(ValueError):
        prism_payment_middleware(Flask(__name__), CONFIG, routes)
