using System.Collections.Generic;

namespace Prism.Core.Compatibility;

/// <summary>
/// Network ID Mapper - Convert between v1 and v2 network formats
/// v1: "base-sepolia", "ethereum-mainnet"
/// v2: "eip155:84532" (CAIP-2 format)
/// </summary>
public static class NetworkMapper
{
    // v1 to v2 network mappings
    private static readonly Dictionary<string, string> NetworkV1ToV2 = new(StringComparer.OrdinalIgnoreCase)
    {
        // Base networks
        ["base-sepolia"] = "eip155:84532",
        ["base-mainnet"] = "eip155:8453",
        ["base"] = "eip155:8453",
        
        // Ethereum networks
        ["ethereum-mainnet"] = "eip155:1",
        ["ethereum"] = "eip155:1",
        ["sepolia"] = "eip155:11155111",
        ["goerli"] = "eip155:5",
        
        // Polygon networks
        ["polygon-mainnet"] = "eip155:137",
        ["polygon"] = "eip155:137",
        ["polygon-mumbai"] = "eip155:80001",
        
        // Avalanche networks
        ["avalanche-mainnet"] = "eip155:43114",
        ["avalanche"] = "eip155:43114",
        ["avalanche-fuji"] = "eip155:43113",
        
        // Arbitrum networks
        ["arbitrum-mainnet"] = "eip155:42161",
        ["arbitrum"] = "eip155:42161",
        ["arbitrum-sepolia"] = "eip155:421614",
        
        // Optimism networks
        ["optimism-mainnet"] = "eip155:10",
        ["optimism"] = "eip155:10",
        ["optimism-sepolia"] = "eip155:11155420",
        
        // BSC networks
        ["bsc-mainnet"] = "eip155:56",
        ["bsc"] = "eip155:56",
        ["bsc-testnet"] = "eip155:97",
        
        // Solana (non-EVM)
        ["solana-mainnet"] = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        ["solana"] = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        ["solana-devnet"] = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    };
    
    // v2 to v1 network mappings (reverse)
    private static readonly Dictionary<string, string> NetworkV2ToV1 = new(StringComparer.OrdinalIgnoreCase)
    {
        // Base networks
        ["eip155:84532"] = "base-sepolia",
        ["eip155:8453"] = "base-mainnet",
        
        // Ethereum networks
        ["eip155:1"] = "ethereum-mainnet",
        ["eip155:11155111"] = "sepolia",
        ["eip155:5"] = "goerli",
        
        // Polygon networks
        ["eip155:137"] = "polygon-mainnet",
        ["eip155:80001"] = "polygon-mumbai",
        
        // Avalanche networks
        ["eip155:43114"] = "avalanche-mainnet",
        ["eip155:43113"] = "avalanche-fuji",
        
        // Arbitrum networks
        ["eip155:42161"] = "arbitrum-mainnet",
        ["eip155:421614"] = "arbitrum-sepolia",
        
        // Optimism networks
        ["eip155:10"] = "optimism-mainnet",
        ["eip155:11155420"] = "optimism-sepolia",
        
        // BSC networks
        ["eip155:56"] = "bsc-mainnet",
        ["eip155:97"] = "bsc-testnet",
        
        // Solana (non-EVM)
        ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"] = "solana-mainnet",
        ["solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"] = "solana-devnet",
    };
    
    /// <summary>
    /// Convert v1 network format to v2 CAIP-2 format
    /// </summary>
    /// <param name="networkV1">v1 format like "base-sepolia"</param>
    /// <returns>v2 CAIP-2 format like "eip155:84532"</returns>
    /// <exception cref="ArgumentException">If network is not supported</exception>
    public static string NetworkV1ToV2Convert(string networkV1)
    {
        var normalized = networkV1.Trim();
        
        if (NetworkV1ToV2.TryGetValue(normalized, out var v2Network))
        {
            return v2Network;
        }
        
        // If already in CAIP-2 format, return as-is
        if (normalized.Contains(':'))
        {
            return networkV1;
        }
        
        throw new ArgumentException($"Unsupported v1 network: {networkV1}", nameof(networkV1));
    }
    
    /// <summary>
    /// Convert v2 CAIP-2 format to v1 network format
    /// </summary>
    /// <param name="networkV2">v2 CAIP-2 format like "eip155:84532"</param>
    /// <returns>v1 format like "base-sepolia"</returns>
    /// <exception cref="ArgumentException">If network is not supported</exception>
    public static string NetworkV2ToV1Convert(string networkV2)
    {
        var normalized = networkV2.Trim();
        
        if (NetworkV2ToV1.TryGetValue(normalized, out var v1Network))
        {
            return v1Network;
        }
        
        // If not in CAIP-2 format, might be v1 already
        if (!normalized.Contains(':'))
        {
            return networkV2;
        }
        
        throw new ArgumentException($"Unsupported v2 network: {networkV2}", nameof(networkV2));
    }
    
    /// <summary>
    /// Normalize network ID to target version format
    /// </summary>
    /// <param name="network">Network ID in any format</param>
    /// <param name="targetVersion">Target version (1 or 2)</param>
    /// <returns>Normalized network ID in target version format</returns>
    public static string NormalizeNetwork(string network, int targetVersion)
    {
        return targetVersion switch
        {
            2 => network.Contains(':') ? network : NetworkV1ToV2Convert(network),
            1 => !network.Contains(':') ? network : NetworkV2ToV1Convert(network),
            _ => throw new ArgumentException($"Invalid target version: {targetVersion}", nameof(targetVersion))
        };
    }
    
    /// <summary>
    /// Extract numeric chain ID from CAIP-2 format
    /// </summary>
    /// <param name="networkV2">CAIP-2 format like "eip155:84532"</param>
    /// <returns>Chain ID as integer, or null if not EVM chain</returns>
    public static int? ExtractChainId(string networkV2)
    {
        if (!networkV2.StartsWith("eip155:", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }
        
        var parts = networkV2.Split(':');
        if (parts.Length == 2 && int.TryParse(parts[1], out var chainId))
        {
            return chainId;
        }
        
        return null;
    }
}
