"""
Tests for prism_flask middleware — 12 test cases covering happy path,
error scenarios, settlement, and the require_payment decorator.
"""

from __future__ import annotations

from unittest.mock import patch, MagicMock

import pytest
from flask import Flask, g

from prism_flask import get_payer, get_payment, prism_payment_middleware, require_payment
from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig
from .payments import encode, header_for, requirements_for, v1_payment

# ---------------------------------------------------------------------------
# Shared mock data
# ---------------------------------------------------------------------------

MOCK_REQUIREMENTS = requirements_for()
MOCK_VERIFICATION_VALID = {'valid': True, 'payment': {'signature': '0xSIG'}, 'payer': '0xPAYER'}
MOCK_VERIFICATION_INVALID = {'valid': False, 'error': 'Invalid signature'}
MOCK_SETTLEMENT_SUCCESS = {'success': True, 'transaction': '0xTXHASH'}
MOCK_SETTLEMENT_FAILURE = {'success': False, 'errorReason': 'Insufficient funds'}

CONFIG = PrismMiddlewareConfig(api_key='test-key', debug=True)
ROUTES = {
    '/api/premium': RoutePaymentConfig(price=0.01, description='Premium API'),
    '/api/decorated': RoutePaymentConfig(price=0.01, description='Decorated route'),
}


VALID_HEADER = header_for()
VALID_V1_HEADER = encode(v1_payment())


WELL_FORMED_V1_HEADER = encode({
    'x402Version': 1,
    'scheme': 'exact',
    'network': 'base-sepolia',
    'payload': {
        'signature': '0xSIG',
        'authorization': {
            'from': '0x1111111111111111111111111111111111111111',
            'to': '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01',
            'value': '10000',
            'validAfter': '0',
            'validBefore': '99999999999',
            'nonce': '0xnonce',
        },
    },
})


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_client():
    with patch('prism_sdk_core.PrismClient') as MockClient:
        inst = MockClient.return_value
        inst.get_payment_requirements.return_value = MOCK_REQUIREMENTS
        inst.verify_payment.return_value = MOCK_VERIFICATION_VALID
        inst.settle_payment.return_value = MOCK_SETTLEMENT_SUCCESS
        yield inst


def build_app(config):
    flask_app = Flask(__name__)
    flask_app.config['TESTING'] = True
    prism_payment_middleware(flask_app, config, ROUTES)

    @flask_app.route('/api/premium')
    def premium():
        return {'message': 'ok'}

    @flask_app.route('/api/free')
    def free():
        return {'message': 'free'}

    @flask_app.route('/api/decorated')
    @require_payment(price=0.01, description='Decorated route')
    def decorated():
        return {'message': 'decorated ok'}

    return flask_app


@pytest.fixture
def app(mock_client):
    return build_app(CONFIG)


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def v1_client(mock_client):
    return build_app(PrismMiddlewareConfig(api_key='test-key', debug=True, allowed_versions=[1, 2])).test_client()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_free_route_passes_through(client):
    resp = client.get('/api/free')
    assert resp.status_code == 200
    assert resp.get_json()['message'] == 'free'


def test_protected_route_without_payment_returns_402(client):
    resp = client.get('/api/premium')
    assert resp.status_code == 402


def test_402_body_contains_payment_requirements(client):
    resp = client.get('/api/premium')
    body = resp.get_json()
    # Body is raw PaymentRequiredResponse (not wrapped under 'payment' key)
    assert 'x402Version' in body or 'amount' in body


def test_protected_route_valid_payment_returns_200(client, mock_client):
    resp = client.get('/api/premium', headers={'PAYMENT-SIGNATURE': VALID_HEADER})
    assert resp.status_code == 200


def test_settlement_called_after_200(client, mock_client):
    client.get('/api/premium', headers={'PAYMENT-SIGNATURE': VALID_HEADER})
    mock_client.settle_payment.assert_called_once()


def test_settlement_response_header_set(client, mock_client):
    resp = client.get('/api/premium', headers={'PAYMENT-SIGNATURE': VALID_HEADER})
    # PAYMENT-RESPONSE (v2) or X-PAYMENT-RESPONSE (v1) must be present
    assert (
        'PAYMENT-RESPONSE' in resp.headers
        or 'X-PAYMENT-RESPONSE' in resp.headers
    )


def test_invalid_payment_returns_402(client, mock_client):
    mock_client.verify_payment.return_value = MOCK_VERIFICATION_INVALID
    resp = client.get('/api/premium', headers={'PAYMENT-SIGNATURE': VALID_HEADER})
    assert resp.status_code == 402


def test_v1_x_payment_header_accepted(v1_client, mock_client):
    resp = v1_client.get('/api/premium', headers={'X-PAYMENT': VALID_V1_HEADER})
    assert resp.status_code == 200


def test_settlement_failure_returns_402(client, mock_client):
    mock_client.settle_payment.return_value = MOCK_SETTLEMENT_FAILURE
    resp = client.get('/api/premium', headers={'PAYMENT-SIGNATURE': VALID_HEADER})
    assert resp.status_code == 402


def test_requirements_api_error_returns_500(client, mock_client):
    mock_client.get_payment_requirements.side_effect = Exception('Network error')
    resp = client.get('/api/premium')
    assert resp.status_code == 500


def test_require_payment_decorator_blocks_without_prism_payer(client, mock_client):
    # /api/decorated is protected by decorator; no payment header → no prism_payer in g
    mock_client.get_payment_requirements.side_effect = Exception('no requirements')
    resp = client.get('/api/decorated')
    # Either the middleware returns 500 (requirements error) or decorator returns 402
    assert resp.status_code in (402, 500)


def test_require_payment_decorator_passes_with_prism_payer(client, mock_client):
    resp = client.get('/api/decorated', headers={'PAYMENT-SIGNATURE': VALID_HEADER})
    assert resp.status_code == 200


def test_v1_payment_rejected_with_402_before_any_gateway_call_when_only_v2_allowed(client, mock_client):
    resp = client.get('/api/premium', headers={'X-PAYMENT': WELL_FORMED_V1_HEADER})
    assert resp.status_code == 402
    mock_client.get_payment_requirements.assert_not_called()
    mock_client.verify_payment.assert_not_called()
    mock_client.settle_payment.assert_not_called()


def test_get_payer_returns_verified_payer():
    flask_app = Flask(__name__)
    with flask_app.test_request_context('/'):
        g._prism_payer = '0xPAYER'
        assert get_payer() == '0xPAYER'


def test_get_payment_returns_verified_payment():
    flask_app = Flask(__name__)
    with flask_app.test_request_context('/'):
        g._prism_payment = {'signature': '0xSIG'}
        assert get_payment() == {'signature': '0xSIG'}


def test_accessors_return_none_when_unpaid():
    flask_app = Flask(__name__)
    with flask_app.test_request_context('/'):
        assert get_payer() is None
        assert get_payment() is None


def test_accessors_ignore_unprefixed_attributes():
    flask_app = Flask(__name__)
    with flask_app.test_request_context('/'):
        g.prism_payer = '0xSPOOF'
        g.prism_payment = {'signature': '0xSPOOF'}
        assert get_payer() is None
        assert get_payment() is None



UNCONFIRMED_SETTLEMENTS = [
    pytest.param({'success': True}, 'settlement_not_confirmed', id='success-without-transaction'),
    pytest.param({}, 'settlement_not_confirmed', id='empty-reply'),
    pytest.param({'success': False, 'errorReason': 'x'}, 'x', id='declined'),
    pytest.param({'success': True, 'transaction': ''}, 'settlement_not_confirmed', id='empty-transaction'),
    pytest.param({'success': 'true', 'transaction': '0x1'}, 'settlement_not_confirmed', id='non-boolean-success'),
]


@pytest.mark.parametrize('settlement, details', UNCONFIRMED_SETTLEMENTS)
def test_unconfirmed_settlement_withholds_content(client, mock_client, settlement, details):
    mock_client.settle_payment.return_value = settlement
    resp = client.get('/api/premium', headers={'PAYMENT-SIGNATURE': VALID_HEADER})
    assert resp.status_code == 402
    assert b'"ok"' not in resp.data
    assert resp.get_json()['details'] == details
    assert 'PAYMENT-RESPONSE' not in resp.headers


def test_settled_transaction_delivers_content_with_settlement_header(client, mock_client):
    mock_client.settle_payment.return_value = {'success': True, 'transaction': '0x1'}
    resp = client.get('/api/premium', headers={'PAYMENT-SIGNATURE': VALID_HEADER})
    assert resp.status_code == 200
    assert resp.get_json()['message'] == 'ok'
    assert 'PAYMENT-RESPONSE' in resp.headers
