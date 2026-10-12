from __future__ import annotations

import base64
import json
from typing import Any, Dict

NETWORK = 'eip155:84532'
V1_NETWORK = 'base-sepolia'
ASSET = '0xASSET'
PAY_TO = '0xTEST'
PAYER = '0xPAYER'
DEFAULT_AMOUNT = '10000'


def amount_for(price: Any) -> str:
    return str(round(float(str(price).lstrip('$')) * 1_000_000))


def requirement(amount: str = DEFAULT_AMOUNT) -> Dict[str, Any]:
    return {
        'scheme': 'exact',
        'network': NETWORK,
        'asset': ASSET,
        'payTo': PAY_TO,
        'amount': amount,
        'maxTimeoutSeconds': 60,
    }


def requirements_for(price: Any = None) -> Dict[str, Any]:
    amount = DEFAULT_AMOUNT if price is None else amount_for(price)
    return {'x402Version': 2, 'accepts': [requirement(amount)]}


def _payload(amount: str) -> Dict[str, Any]:
    return {
        'signature': '0xSIG',
        'authorization': {
            'from': PAYER,
            'to': PAY_TO,
            'value': amount,
            'validAfter': '0',
            'validBefore': '9999999999',
            'nonce': '0x01',
        },
    }


def payment(amount: str = DEFAULT_AMOUNT) -> Dict[str, Any]:
    return {'x402Version': 2, 'accepted': requirement(amount), 'payload': _payload(amount)}


def v1_payment(amount: str = DEFAULT_AMOUNT) -> Dict[str, Any]:
    return {
        'x402Version': 1,
        'scheme': 'exact',
        'network': V1_NETWORK,
        'payload': _payload(amount),
    }


def encode(data: Dict[str, Any]) -> str:
    return base64.b64encode(json.dumps(data).encode()).decode()


def header_for(price: Any = None) -> str:
    amount = DEFAULT_AMOUNT if price is None else amount_for(price)
    return encode(payment(amount))
