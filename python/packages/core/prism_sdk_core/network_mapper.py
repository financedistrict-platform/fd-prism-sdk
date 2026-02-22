"""
Network ID Mapper - Convert between v1 and v2 network formats
v1: "base-sepolia", "ethereum-mainnet"
v2: "eip155:84532" (CAIP-2 format)
"""

from typing import Dict, Optional


# v1 to v2 network mappings
NETWORK_V1_TO_V2: Dict[str, str] = {
    # Base networks
    "base-sepolia": "eip155:84532",
    "base-mainnet": "eip155:8453",
    "base": "eip155:8453",
    
    # Ethereum networks
    "ethereum-mainnet": "eip155:1",
    "ethereum": "eip155:1",
    "sepolia": "eip155:11155111",
    "goerli": "eip155:5",
    
    # Polygon networks
    "polygon-mainnet": "eip155:137",
    "polygon": "eip155:137",
    "polygon-mumbai": "eip155:80001",
    
    # Avalanche networks
    "avalanche-mainnet": "eip155:43114",
    "avalanche": "eip155:43114",
    "avalanche-fuji": "eip155:43113",
    
    # Arbitrum networks
    "arbitrum-mainnet": "eip155:42161",
    "arbitrum": "eip155:42161",
    "arbitrum-sepolia": "eip155:421614",
    
    # Optimism networks
    "optimism-mainnet": "eip155:10",
    "optimism": "eip155:10",
    "optimism-sepolia": "eip155:11155420",
    
    # BSC networks
    "bsc-mainnet": "eip155:56",
    "bsc": "eip155:56",
    "bsc-testnet": "eip155:97",
    
    # Solana (non-EVM)
    "solana-mainnet": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    "solana": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    "solana-devnet": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
}


# v2 to v1 network mappings (reverse)
NETWORK_V2_TO_V1: Dict[str, str] = {
    # Base networks
    "eip155:84532": "base-sepolia",
    "eip155:8453": "base-mainnet",
    
    # Ethereum networks
    "eip155:1": "ethereum-mainnet",
    "eip155:11155111": "sepolia",
    "eip155:5": "goerli",
    
    # Polygon networks
    "eip155:137": "polygon-mainnet",
    "eip155:80001": "polygon-mumbai",
    
    # Avalanche networks
    "eip155:43114": "avalanche-mainnet",
    "eip155:43113": "avalanche-fuji",
    
    # Arbitrum networks
    "eip155:42161": "arbitrum-mainnet",
    "eip155:421614": "arbitrum-sepolia",
    
    # Optimism networks
    "eip155:10": "optimism-mainnet",
    "eip155:11155420": "optimism-sepolia",
    
    # BSC networks
    "eip155:56": "bsc-mainnet",
    "eip155:97": "bsc-testnet",
    
    # Solana (non-EVM)
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "solana-mainnet",
    "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": "solana-devnet",
}


def network_v1_to_v2(network_v1: str) -> str:
    """
    Convert v1 network format to v2 CAIP-2 format
    
    Args:
        network_v1: v1 format like "base-sepolia"
        
    Returns:
        v2 CAIP-2 format like "eip155:84532"
        
    Raises:
        ValueError: If network is not supported
    """
    normalized = network_v1.lower().strip()
    
    if normalized in NETWORK_V1_TO_V2:
        return NETWORK_V1_TO_V2[normalized]
    
    # If already in CAIP-2 format, return as-is
    if ":" in normalized:
        return network_v1
    
    raise ValueError(f"Unsupported v1 network: {network_v1}")


def network_v2_to_v1(network_v2: str) -> str:
    """
    Convert v2 CAIP-2 format to v1 network format
    
    Args:
        network_v2: v2 CAIP-2 format like "eip155:84532"
        
    Returns:
        v1 format like "base-sepolia"
        
    Raises:
        ValueError: If network is not supported
    """
    normalized = network_v2.lower().strip()
    
    if normalized in NETWORK_V2_TO_V1:
        return NETWORK_V2_TO_V1[normalized]
    
    # If not in CAIP-2 format, might be v1 already
    if ":" not in normalized:
        return network_v2
    
    raise ValueError(f"Unsupported v2 network: {network_v2}")


def normalize_network(network: str, target_version: int) -> str:
    """
    Normalize network ID to target version format
    
    Args:
        network: Network ID in any format
        target_version: Target version (1 or 2)
        
    Returns:
        Normalized network ID in target version format
    """
    if target_version == 2:
        # Already v2 format?
        if ":" in network:
            return network
        # Convert from v1 to v2
        return network_v1_to_v2(network)
    elif target_version == 1:
        # Already v1 format?
        if ":" not in network:
            return network
        # Convert from v2 to v1
        return network_v2_to_v1(network)
    else:
        raise ValueError(f"Invalid target version: {target_version}")


def extract_chain_id(network_v2: str) -> Optional[int]:
    """
    Extract numeric chain ID from CAIP-2 format
    
    Args:
        network_v2: CAIP-2 format like "eip155:84532"
        
    Returns:
        Chain ID as integer, or None if not EVM chain
    """
    if not network_v2.startswith("eip155:"):
        return None
    
    try:
        return int(network_v2.split(":")[1])
    except (IndexError, ValueError):
        return None


__all__ = [
    'NETWORK_V1_TO_V2',
    'NETWORK_V2_TO_V1',
    'network_v1_to_v2',
    'network_v2_to_v1',
    'normalize_network',
    'extract_chain_id',
]
