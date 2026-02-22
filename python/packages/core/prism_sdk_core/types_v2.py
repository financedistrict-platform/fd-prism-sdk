"""
x402 Protocol v2 Type Definitions (Current Standard)
✅ DEFAULT: Use these types for all new implementations
"""

from typing import TypedDict, Optional, List


# v2 HTTP Headers
V2_HEADER_PAYMENT_SIGNATURE = "PAYMENT-SIGNATURE"
V2_HEADER_PAYMENT_RESPONSE = "PAYMENT-RESPONSE"
V2_HEADER_PAYMENT_REQUIRED = "PAYMENT-REQUIRED"


class ResourceInfoV2(TypedDict):
    """Resource information for payment"""
    url: str
    description: str


class PaymentRequirementsV2(TypedDict, total=False):
    """
    v2 Payment requirements (current standard)
    Returned in 402 response with PAYMENT-REQUIRED header
    """
    amount: str  # v2 uses 'amount' instead of 'maxAmountRequired'
    network: str  # v2 CAIP-2 format: "eip155:84532" (Base Sepolia)
    paymentAddress: str
    deadline: int
    nonce: str
    accepted: List[ResourceInfoV2]  # v2 has nested 'accepted' with ResourceInfo
    x402Version: int  # Always 2


class PaymentPayloadV2(TypedDict, total=False):
    """
    v2 Payment payload structure (current)
    Sent in PAYMENT-SIGNATURE header
    """
    signature: str
    payer: str
    amount: str
    nonce: str
    deadline: int
    network: str  # v2 CAIP-2 format: "eip155:84532"
    accepted: List[ResourceInfoV2]  # v2 nested structure
    x402Version: int  # Always 2


class SettlementResponseV2(TypedDict):
    """
    v2 Settlement response (current)
    Sent in PAYMENT-RESPONSE header after successful delivery
    """
    success: bool
    transaction: str  # Transaction hash
    errorReason: Optional[str]


__all__ = [
    'V2_HEADER_PAYMENT_SIGNATURE',
    'V2_HEADER_PAYMENT_RESPONSE',
    'V2_HEADER_PAYMENT_REQUIRED',
    'ResourceInfoV2',
    'PaymentRequirementsV2',
    'PaymentPayloadV2',
    'SettlementResponseV2',
]
