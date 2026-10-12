from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from .network_mapper import network_v1_to_v2

_DECIMAL_INTEGER = re.compile(r'[0-9]{1,78}')


def _same_text(a: Any, b: Any) -> bool:
    return isinstance(a, str) and isinstance(b, str) and a.lower() == b.lower()


def _is_decimal(value: Any) -> bool:
    return isinstance(value, str) and _DECIMAL_INTEGER.fullmatch(value) is not None


def _same_amount(a: Any, b: Any) -> bool:
    return _is_decimal(a) and _is_decimal(b) and int(a) == int(b)


def _same_network(declared: Any, required: Any) -> bool:
    if not isinstance(declared, str) or not isinstance(required, str):
        return False
    if declared == required:
        return True
    try:
        return network_v1_to_v2(declared) == required
    except ValueError:
        return False


def _authorization(payment: Dict[str, Any]) -> Dict[str, Any]:
    payload = payment.get('payload')
    authorization = payload.get('authorization') if isinstance(payload, dict) else None
    return authorization if isinstance(authorization, dict) else {}


def is_v2_payment(payment: Dict[str, Any]) -> bool:
    return payment.get('x402Version') == 2


def required_amount(requirement: Dict[str, Any]) -> Optional[str]:
    amount = requirement.get('amount')
    return amount if amount is not None else requirement.get('maxAmountRequired')


def payment_accepts_requirement(payment: Dict[str, Any], requirement: Dict[str, Any]) -> bool:
    if not is_v2_payment(payment):
        return payment.get('scheme') == requirement.get('scheme') and _same_network(
            payment.get('network'), requirement.get('network')
        )

    accepted = payment.get('accepted')
    if not isinstance(accepted, dict):
        return False
    return (
        accepted.get('scheme') == requirement.get('scheme')
        and accepted.get('network') == requirement.get('network')
        and _same_text(accepted.get('asset'), requirement.get('asset'))
        and _same_text(accepted.get('payTo'), requirement.get('payTo'))
        and _same_amount(accepted.get('amount'), required_amount(requirement))
    )


def find_requirement_for_payment(
    requirements: List[Dict[str, Any]], payment: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    for requirement in requirements:
        if isinstance(requirement, dict) and payment_accepts_requirement(payment, requirement):
            return requirement
    return None


def validate_payment_binding(payment: Dict[str, Any], requirement: Dict[str, Any]) -> Optional[str]:
    if not payment_accepts_requirement(payment, requirement):
        return 'Payment does not match the payment requirement'

    authorization = _authorization(payment)
    if not authorization:
        return 'Payment authorization is missing'
    if not _same_text(authorization.get('to'), requirement.get('payTo')):
        return 'Payment recipient does not match the payment requirement'
    if not _same_amount(authorization.get('value'), required_amount(requirement)):
        return 'Payment amount does not match the payment requirement'
    return None


def validate_payment_window(payment: Dict[str, Any], now_seconds: int) -> Optional[str]:
    authorization = _authorization(payment)
    valid_after = authorization.get('validAfter')
    valid_before = authorization.get('validBefore')

    if not _is_decimal(valid_after) or not _is_decimal(valid_before):
        return 'Payment validity window is malformed'
    if int(valid_after) > now_seconds:
        return 'Payment is not yet valid'
    if int(valid_before) <= now_seconds:
        return 'Payment has expired'
    return None


def validate_payment_resource(payment: Dict[str, Any], expected_resource_url: str) -> Optional[str]:
    resource = payment.get('resource')
    if resource is None:
        return None
    url = resource.get('url') if isinstance(resource, dict) else None
    if url != expected_resource_url:
        return 'Payment resource does not match the requested resource'
    return None
