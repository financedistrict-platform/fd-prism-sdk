"""
Schema Transformer - Bidirectional transformation between v1 and v2 schemas
"""

from typing import Dict, Any, List, Literal
from .network_mapper import network_v1_to_v2, network_v2_to_v1


class SchemaTransformer:
    """
    Transforms payment schemas between v1 and v2 formats
    Provides bidirectional conversion for PaymentRequirements, PaymentPayload, and SettlementResponse
    """
    
    @staticmethod
    def upgrade_payment_requirements(v1_requirements: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform v1 PaymentRequirements to v2 format
        
        v1 → v2 changes:
        - maxAmountRequired → amount
        - network: "base-sepolia" → "eip155:84532" (CAIP-2)
        - resourceUrl + description → accepted: [{ url, description }]
        - x402Version: 1 → 2
        """
        v2_requirements = {
            'amount': v1_requirements.get('maxAmountRequired', v1_requirements.get('amount', '0')),
            'network': network_v1_to_v2(v1_requirements.get('network', 'base-sepolia')),
            'paymentAddress': v1_requirements.get('paymentAddress', ''),
            'deadline': v1_requirements.get('deadline', 0),
            'nonce': v1_requirements.get('nonce', ''),
            'accepted': [{
                'url': v1_requirements.get('resourceUrl', ''),
                'description': v1_requirements.get('description', '')
            }],
            'x402Version': 2
        }
        
        return v2_requirements
    
    @staticmethod
    def downgrade_payment_requirements(v2_requirements: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform v2 PaymentRequirements to v1 format
        
        v2 → v1 changes:
        - amount → maxAmountRequired
        - network: "eip155:84532" → "base-sepolia"
        - accepted: [{ url, description }] → resourceUrl + description
        - x402Version: 2 → 1
        """
        accepted = v2_requirements.get('accepted', [])
        first_resource = accepted[0] if accepted else {'url': '', 'description': ''}
        
        v1_requirements = {
            'maxAmountRequired': v2_requirements.get('amount', v2_requirements.get('maxAmountRequired', '0')),
            'network': network_v2_to_v1(v2_requirements.get('network', 'eip155:84532')),
            'paymentAddress': v2_requirements.get('paymentAddress', ''),
            'deadline': v2_requirements.get('deadline', 0),
            'nonce': v2_requirements.get('nonce', ''),
            'resourceUrl': first_resource.get('url', ''),
            'description': first_resource.get('description', ''),
            'x402Version': 1
        }
        
        return v1_requirements
    
    @staticmethod
    def upgrade_payment_payload(v1_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform v1 PaymentPayload to v2 format
        
        v1 → v2 changes:
        - network: "base-sepolia" → "eip155:84532"
        - resourceUrl → accepted: [{ url, description }]
        - x402Version: 1 → 2
        """
        v2_payload = {
            'signature': v1_payload.get('signature', ''),
            'payer': v1_payload.get('payer', ''),
            'amount': v1_payload.get('amount', '0'),
            'nonce': v1_payload.get('nonce', ''),
            'deadline': v1_payload.get('deadline', 0),
            'network': network_v1_to_v2(v1_payload.get('network', 'base-sepolia')),
            'accepted': [{
                'url': v1_payload.get('resourceUrl', ''),
                'description': v1_payload.get('description', '')
            }],
            'x402Version': 2
        }
        
        return v2_payload
    
    @staticmethod
    def downgrade_payment_payload(v2_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform v2 PaymentPayload to v1 format
        
        v2 → v1 changes:
        - network: "eip155:84532" → "base-sepolia"
        - accepted: [{ url, description }] → resourceUrl
        - x402Version: 2 → 1
        """
        accepted = v2_payload.get('accepted', [])
        first_resource = accepted[0] if accepted else {'url': '', 'description': ''}
        
        v1_payload = {
            'signature': v2_payload.get('signature', ''),
            'payer': v2_payload.get('payer', ''),
            'amount': v2_payload.get('amount', '0'),
            'nonce': v2_payload.get('nonce', ''),
            'deadline': v2_payload.get('deadline', 0),
            'network': network_v2_to_v1(v2_payload.get('network', 'eip155:84532')),
            'resourceUrl': first_resource.get('url', ''),
            'x402Version': 1
        }
        
        return v1_payload
    
    @staticmethod
    def transform_payment_required_response(
        requirements: Dict[str, Any],
        target_version: Literal[1, 2]
    ) -> Dict[str, Any]:
        """
        Transform PaymentRequirements to target protocol version
        
        Args:
            requirements: PaymentRequirements in any version
            target_version: Target protocol version (1 or 2)
            
        Returns:
            Transformed requirements for target version
        """
        current_version = requirements.get('x402Version', 2)
        
        if current_version == target_version:
            return requirements
        
        if target_version == 2:
            return SchemaTransformer.upgrade_payment_requirements(requirements)
        else:
            return SchemaTransformer.downgrade_payment_requirements(requirements)
    
    @staticmethod
    def transform_payment_payload(
        payload: Dict[str, Any],
        target_version: Literal[1, 2]
    ) -> Dict[str, Any]:
        """
        Transform PaymentPayload to target protocol version
        
        Args:
            payload: PaymentPayload in any version
            target_version: Target protocol version (1 or 2)
            
        Returns:
            Transformed payload for target version
        """
        current_version = payload.get('x402Version', 2)
        
        if current_version == target_version:
            return payload
        
        if target_version == 2:
            return SchemaTransformer.upgrade_payment_payload(payload)
        else:
            return SchemaTransformer.downgrade_payment_payload(payload)


__all__ = ['SchemaTransformer']
