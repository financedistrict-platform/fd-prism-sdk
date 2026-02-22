"""
Protocol Version Detector - Auto-detect x402 protocol version from payloads
"""

import json
import base64
from typing import Optional, Dict, Any, Literal


def detect_protocol_version(payload: str) -> Optional[Literal[1, 2]]:
    """
    Detect protocol version from payment payload
    
    Args:
        payload: Payment payload string (may be base64 encoded JSON)
        
    Returns:
        Protocol version (1 or 2) or None if cannot detect
    """
    try:
        # Try to parse as JSON first
        data = _try_parse_json(payload)
        
        if data and isinstance(data, dict):
            # Check for explicit version field
            if 'x402Version' in data:
                version = data['x402Version']
                if version in [1, 2]:
                    return version
            
            # Heuristic detection based on structure
            if _is_v2_payload(data):
                return 2
            elif _is_v1_payload(data):
                return 1
        
        return None
    except Exception:
        return None


def _try_parse_json(payload: str) -> Optional[Dict[str, Any]]:
    """Try to parse payload as JSON, with base64 decoding if needed"""
    try:
        # Try direct JSON parse
        return json.loads(payload)
    except (json.JSONDecodeError, ValueError):
        pass
    
    try:
        # Try base64 decode then JSON parse
        decoded = base64.b64decode(payload).decode('utf-8')
        return json.loads(decoded)
    except Exception:
        pass
    
    return None


def _is_v1_payload(data: Dict[str, Any]) -> bool:
    """
    Check if payload structure matches v1 format
    v1: flat structure with 'network' as string like "base-sepolia"
    v1: has 'resourceUrl' at top level
    """
    if 'resourceUrl' in data and isinstance(data.get('resourceUrl'), str):
        # v1 has resourceUrl at top level
        network = data.get('network', '')
        if isinstance(network, str) and ':' not in network:
            # v1 network format (no colon)
            return True
    
    # Check for v1-specific field: maxAmountRequired
    if 'maxAmountRequired' in data:
        return True
    
    return False


def _is_v2_payload(data: Dict[str, Any]) -> bool:
    """
    Check if payload structure matches v2 format
    v2: has 'accepted' array with ResourceInfo objects
    v2: has 'network' in CAIP-2 format like "eip155:84532"
    v2: has 'amount' instead of 'maxAmountRequired'
    """
    # Check for v2-specific nested structure
    if 'accepted' in data and isinstance(data.get('accepted'), list):
        accepted = data['accepted']
        if accepted and isinstance(accepted[0], dict):
            if 'url' in accepted[0] and 'description' in accepted[0]:
                # v2 has ResourceInfo structure
                return True
    
    # Check for v2 network format (CAIP-2)
    network = data.get('network', '')
    if isinstance(network, str) and ':' in network:
        # v2 uses CAIP-2 format with colon
        return True
    
    # Check for v2-specific field: amount (not maxAmountRequired)
    if 'amount' in data and 'maxAmountRequired' not in data:
        return True
    
    return False


def get_default_protocol_version() -> Literal[2]:
    """
    Get default protocol version
    Returns 2 (current standard)
    """
    return 2


__all__ = [
    'detect_protocol_version',
    'get_default_protocol_version',
]
