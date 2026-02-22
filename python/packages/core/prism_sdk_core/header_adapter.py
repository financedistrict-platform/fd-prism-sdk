"""
Header Adapter - Handle HTTP header differences between protocol versions
"""

from typing import Optional, Callable, Literal
from .types_v1 import V1_HEADER_PAYMENT, V1_HEADER_PAYMENT_RESPONSE
from .types_v2 import V2_HEADER_PAYMENT_SIGNATURE, V2_HEADER_PAYMENT_RESPONSE


class HeaderAdapter:
    """
    Adapter for reading/writing x402 protocol headers
    Supports both v1 and v2 header formats
    """
    
    @staticmethod
    def get_payment_payload(
        header_getter: Callable[[str], Optional[str]]
    ) -> Optional[str]:
        """
        Get payment payload from request headers
        Tries both v2 (PAYMENT-SIGNATURE) and v1 (X-PAYMENT) headers
        
        Args:
            header_getter: Function to get header value by name
            
        Returns:
            Payment payload string (base64 encoded) or None
        """
        # Try v2 header first (current standard)
        v2_payload = header_getter(V2_HEADER_PAYMENT_SIGNATURE)
        if v2_payload:
            return v2_payload
        
        # Fall back to v1 header (legacy)
        v1_payload = header_getter(V1_HEADER_PAYMENT)
        if v1_payload:
            return v1_payload
        
        return None
    
    @staticmethod
    def set_payment_payload(
        header_setter: Callable[[str, str], None],
        payload: str,
        protocol_version: Literal[1, 2] = 2
    ) -> None:
        """
        Set payment payload in response headers
        
        Args:
            header_setter: Function to set header (name, value)
            payload: Payment payload (base64 encoded)
            protocol_version: Protocol version (1 or 2)
        """
        if protocol_version == 2:
            header_setter(V2_HEADER_PAYMENT_SIGNATURE, payload)
        else:
            header_setter(V1_HEADER_PAYMENT, payload)
    
    @staticmethod
    def get_settlement_response(
        header_getter: Callable[[str], Optional[str]]
    ) -> Optional[str]:
        """
        Get settlement response from response headers
        Tries both v2 (PAYMENT-RESPONSE) and v1 (X-PAYMENT-RESPONSE) headers
        
        Args:
            header_getter: Function to get header value by name
            
        Returns:
            Settlement response string (base64 encoded) or None
        """
        # Try v2 header first
        v2_response = header_getter(V2_HEADER_PAYMENT_RESPONSE)
        if v2_response:
            return v2_response
        
        # Fall back to v1 header
        v1_response = header_getter(V1_HEADER_PAYMENT_RESPONSE)
        if v1_response:
            return v1_response
        
        return None
    
    @staticmethod
    def set_settlement_response(
        header_setter: Callable[[str, str], None],
        response: str,
        protocol_version: Literal[1, 2] = 2
    ) -> None:
        """
        Set settlement response in response headers
        
        Args:
            header_setter: Function to set header (name, value)
            response: Settlement response (base64 encoded)
            protocol_version: Protocol version (1 or 2)
        """
        if protocol_version == 2:
            header_setter(V2_HEADER_PAYMENT_RESPONSE, response)
        else:
            header_setter(V1_HEADER_PAYMENT_RESPONSE, response)
    
    @staticmethod
    def detect_version_from_headers(
        header_getter: Callable[[str], Optional[str]]
    ) -> Optional[Literal[1, 2]]:
        """
        Detect protocol version from request headers
        
        Args:
            header_getter: Function to get header value by name
            
        Returns:
            Protocol version (1 or 2) or None if no payment header found
        """
        # Check for v2 header
        if header_getter(V2_HEADER_PAYMENT_SIGNATURE):
            return 2
        
        # Check for v1 header
        if header_getter(V1_HEADER_PAYMENT):
            return 1
        
        return None


__all__ = ['HeaderAdapter']
