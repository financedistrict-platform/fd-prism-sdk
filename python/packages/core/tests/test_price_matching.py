from __future__ import annotations

from decimal import Decimal

import pytest

from prism_sdk_core import normalize_price, prices_match


@pytest.mark.parametrize('left,right', [
    (0.05, '$0.05'),
    ('0.05', 0.05),
    (1, '1.00'),
    ('$0.5', 0.5),
])
def test_equal_prices_match(left, right):
    assert prices_match(left, right)


@pytest.mark.parametrize('left,right', [
    (0.01, 0.05),
    ('$0.001', '$0.01'),
    (0.05, None),
    (0.05, 'abc'),
])
def test_different_or_invalid_prices_do_not_match(left, right):
    assert not prices_match(left, right)


@pytest.mark.parametrize('bad', ['abc', '', None, True, float('nan'), float('inf'), -1, [0.01]])
def test_invalid_prices_are_rejected(bad):
    with pytest.raises(ValueError):
        normalize_price(bad)


def test_float_price_is_not_distorted():
    assert normalize_price(0.05) == Decimal('0.05')
