from __future__ import annotations

import pytest

from prism_sdk_core import PrismMiddlewareConfig, PrismMiddlewareCore, RoutePaymentConfig


def make_core(*routes: tuple[str, float]) -> PrismMiddlewareCore:
    return PrismMiddlewareCore(
        PrismMiddlewareConfig(api_key='test-key'),
        {path: RoutePaymentConfig(price=price, description=path) for path, price in routes},
    )


CHEAP_FIRST = (('/api', 0.001), ('/api/premium', 0.01), ('/api/premium/gold', 0.05))


def test_longest_prefix_wins_when_cheaper_route_is_configured_first():
    core = make_core(*CHEAP_FIRST)
    assert core.find_matching_route('/api/premium/silver').price == 0.01
    assert core.find_matching_route('/api/premium/gold/bar').price == 0.05
    assert core.find_matching_route('/api/free').price == 0.001


@pytest.mark.parametrize('order', [(0, 1, 2), (2, 1, 0), (1, 0, 2), (1, 2, 0)])
def test_precedence_does_not_depend_on_config_order(order):
    core = make_core(*(CHEAP_FIRST[i] for i in order))
    assert core.find_matching_route('/api/premium/silver').price == 0.01
    assert core.find_matching_route('/api/premium/gold/bar').price == 0.05


def test_precedence_does_not_depend_on_price():
    core = make_core(('/api', 5.0), ('/api/premium', 0.01))
    assert core.find_matching_route('/api/premium/silver').price == 0.01


def test_exact_match_beats_every_prefix():
    core = make_core(*CHEAP_FIRST)
    assert core.find_matching_route('/api/premium/gold').price == 0.05


def test_longer_prefix_does_not_match_across_segment_boundary():
    core = make_core(('/api', 0.001), ('/api/premium', 0.01))
    assert core.find_matching_route('/api/premium-extra/x').price == 0.001


class RecordingClient:
    def __init__(self):
        self.prices = []

    def get_payment_requirements(self, resource_url, price, description):
        self.prices.append(price)
        return {
            'x402Version': 2,
            'resource': {'url': resource_url},
            'accepts': [{'scheme': 'exact', 'network': 'eip155:8453', 'amount': '1000000', 'asset': '0xUSDC', 'payTo': '0xPayTo', 'maxTimeoutSeconds': 60}],
        }


@pytest.mark.parametrize('order', [(0, 1, 2), (2, 1, 0)])
def test_handle_request_quotes_the_price_of_the_longest_prefix(order):
    core = make_core(*(CHEAP_FIRST[i] for i in order))
    client = RecordingClient()
    core.client = client

    result = core.handle_request('/api/premium/silver', 'https://api.test/api/premium/silver')

    assert result.handled is True
    assert result.status_code == 402
    assert client.prices == [0.01]
