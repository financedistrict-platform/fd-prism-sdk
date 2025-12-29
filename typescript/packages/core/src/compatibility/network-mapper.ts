/**
 * Network ID Mapper: v1 ↔ v2
 * 
 * Converts between v1 string format and v2 CAIP-2 format
 * CAIP-2 format: {namespace}:{reference}
 * 
 * @see https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md
 */

/**
 * Mapping from v1 network identifiers to v2 CAIP-2 format
 */
export const NETWORK_V1_TO_V2: Record<string, string> = {
  // Base
  'base-sepolia': 'eip155:84532',
  'base': 'eip155:8453',
  'base-mainnet': 'eip155:8453',

  // Ethereum
  'ethereum-mainnet': 'eip155:1',
  'ethereum-sepolia': 'eip155:11155111',
  'ethereum-goerli': 'eip155:5',

  // Polygon
  'polygon-mainnet': 'eip155:137',
  'polygon-mumbai': 'eip155:80001',

  // Avalanche
  'avalanche-mainnet': 'eip155:43114',
  'avalanche-fuji': 'eip155:43113',

  // Arbitrum
  'arbitrum-mainnet': 'eip155:42161',
  'arbitrum-one': 'eip155:42161',
  'arbitrum-sepolia': 'eip155:421614',

  // Optimism
  'optimism-mainnet': 'eip155:10',
  'optimism-sepolia': 'eip155:11155420',

  // BSC
  'bsc-mainnet': 'eip155:56',
  'bsc-testnet': 'eip155:97',

  // Solana (example - not EVM)
  'solana-mainnet': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'solana-devnet': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
};

/**
 * Reverse mapping from v2 CAIP-2 to v1 format
 */
export const NETWORK_V2_TO_V1: Record<string, string> = Object.fromEntries(
  Object.entries(NETWORK_V1_TO_V2).map(([v1, v2]) => [v2, v1])
);

/**
 * Detect if a network identifier is in v1 or v2 format
 */
export function isV2Network(network: string): boolean {
  return network.includes(':');
}

/**
 * Convert v1 network identifier to v2 CAIP-2 format
 * 
 * @param v1Network - v1 network identifier (e.g., "base-sepolia")
 * @returns v2 CAIP-2 identifier (e.g., "eip155:84532")
 * @throws Error if network is not supported
 */
export function networkV1ToV2(v1Network: string): string {
  // If already v2 format, return as-is
  if (isV2Network(v1Network)) {
    return v1Network;
  }

  const v2Network = NETWORK_V1_TO_V2[v1Network];
  if (!v2Network) {
    throw new Error(
      `Unsupported v1 network identifier: "${v1Network}". ` +
      `Supported networks: ${Object.keys(NETWORK_V1_TO_V2).join(', ')}`
    );
  }

  return v2Network;
}

/**
 * Convert v2 CAIP-2 network identifier to v1 format
 * 
 * @param v2Network - v2 CAIP-2 identifier (e.g., "eip155:84532")
 * @returns v1 network identifier (e.g., "base-sepolia")
 * @throws Error if network is not supported
 */
export function networkV2ToV1(v2Network: string): string {
  // If already v1 format, return as-is
  if (!isV2Network(v2Network)) {
    return v2Network;
  }

  const v1Network = NETWORK_V2_TO_V1[v2Network];
  if (!v1Network) {
    throw new Error(
      `Unsupported v2 network identifier: "${v2Network}". ` +
      `Supported networks: ${Object.keys(NETWORK_V2_TO_V1).join(', ')}`
    );
  }

  return v1Network;
}

/**
 * Normalize network identifier to target protocol version
 * 
 * @param network - Network identifier in any format
 * @param targetVersion - Target protocol version (1 or 2)
 * @returns Normalized network identifier
 */
export function normalizeNetwork(network: string, targetVersion: 1 | 2): string {
  if (targetVersion === 2) {
    return isV2Network(network) ? network : networkV1ToV2(network);
  } else {
    return isV2Network(network) ? networkV2ToV1(network) : network;
  }
}

/**
 * Extract chain ID from CAIP-2 network identifier
 * 
 * @param v2Network - v2 CAIP-2 identifier (e.g., "eip155:84532")
 * @returns Chain ID as number (e.g., 84532)
 * @throws Error if format is invalid
 */
export function extractChainId(v2Network: string): number {
  if (!isV2Network(v2Network)) {
    throw new Error(`Not a v2 network identifier: "${v2Network}"`);
  }

  const [namespace, reference] = v2Network.split(':');

  if (namespace !== 'eip155') {
    throw new Error(
      `Only EVM networks (eip155) are supported for chain ID extraction. ` +
      `Got namespace: "${namespace}"`
    );
  }

  const chainId = parseInt(reference, 10);
  if (isNaN(chainId)) {
    throw new Error(`Invalid chain ID in network identifier: "${v2Network}"`);
  }

  return chainId;
}
