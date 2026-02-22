"""
x402 Protocol v1 Type Definitions (Legacy)
⚠️ DEPRECATED: Use v2 types for new implementations
"""

from typing import TypedDict, Optional, List


# v1 HTTP Headers
V1_HEADER_PAYMENT = "X-PAYMENT"
V1_HEADER_PAYMENT_RESPONSE = "X-PAYMENT-RESPONSE"


class PaymentPayloadV1(TypedDict, total=False):
    """
    v1 Payment payload structure (legacy)
    Sent in X-PAYMENT header
    """
    signature: str
    payer: str
    amount: str
    nonce: str
    deadline: int
    network: str  # v1 format: "base-sepolia", "ethereum-mainnet"
    resourceUrl: str
    x402Version: int  # Always 1


class PaymentRequirementsV1(TypedDict, total=False):
    """
    v1 Payment requirements response (legacy)
    Returned in 402 response body
    """
    resourceUrl: str
    description: str
    maxAmountRequired: str  # v1 uses maxAmountRequired
    network: str  # v1 format: "base-sepolia"
    paymentAddress: str
    deadline: int
    nonce: str
    x402Version: int  # Always 1


class SettlementResponseV1(TypedDict):
    """
    v1 Settlement response (legacy)
    Sent in X-PAYMENT-RESPONSE header after successful delivery
    """
    success: bool
    transaction: str  # Transaction hash
    errorReason: Optional[str]


__all__ = [
    'V1_HEADER_PAYMENT',
    'V1_HEADER_PAYMENT_RESPONSE',
    'PaymentPayloadV1',
    'PaymentRequirementsV1',
    'SettlementResponseV1',
]
