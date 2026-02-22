namespace Prism.Core.Types.V1;

/// <summary>
/// x402 Protocol v1 Type Definitions (Legacy)
/// ⚠️ DEPRECATED: Use v2 types for new implementations
/// </summary>

/// <summary>
/// v1 HTTP Headers
/// </summary>
public static class V1Headers
{
    public const string Payment = "X-PAYMENT";
    public const string PaymentResponse = "X-PAYMENT-RESPONSE";
}

/// <summary>
/// v1 Payment payload structure (legacy)
/// Sent in X-PAYMENT header
/// </summary>
public class PaymentPayloadV1
{
    public string Signature { get; set; } = string.Empty;
    public string Payer { get; set; } = string.Empty;
    public string Amount { get; set; } = string.Empty;
    public string Nonce { get; set; } = string.Empty;
    public long Deadline { get; set; }
    public string Network { get; set; } = string.Empty; // v1 format: "base-sepolia"
    public string ResourceUrl { get; set; } = string.Empty;
    public int X402Version { get; set; } = 1;
}

/// <summary>
/// v1 Payment requirements response (legacy)
/// Returned in 402 response body
/// </summary>
public class PaymentRequirementsV1
{
    public string ResourceUrl { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string MaxAmountRequired { get; set; } = string.Empty; // v1 uses maxAmountRequired
    public string Network { get; set; } = string.Empty; // v1 format: "base-sepolia"
    public string PaymentAddress { get; set; } = string.Empty;
    public long Deadline { get; set; }
    public string Nonce { get; set; } = string.Empty;
    public int X402Version { get; set; } = 1;
}

/// <summary>
/// v1 Settlement response (legacy)
/// Sent in X-PAYMENT-RESPONSE header after successful delivery
/// </summary>
public class SettlementResponseV1
{
    public bool Success { get; set; }
    public string Transaction { get; set; } = string.Empty;
    public string? ErrorReason { get; set; }
}
