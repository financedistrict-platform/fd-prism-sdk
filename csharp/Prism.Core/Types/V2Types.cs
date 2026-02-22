namespace Prism.Core.Types.V2;

/// <summary>
/// x402 Protocol v2 Type Definitions (Current Standard)
/// ✅ DEFAULT: Use these types for all new implementations
/// </summary>

/// <summary>
/// v2 HTTP Headers
/// </summary>
public static class V2Headers
{
    public const string PaymentSignature = "PAYMENT-SIGNATURE";
    public const string PaymentResponse = "PAYMENT-RESPONSE";
    public const string PaymentRequired = "PAYMENT-REQUIRED";
}

/// <summary>
/// Resource information for payment
/// </summary>
public class ResourceInfoV2
{
    public string Url { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

/// <summary>
/// v2 Payment requirements (current standard)
/// Returned in 402 response with PAYMENT-REQUIRED header
/// </summary>
public class PaymentRequirementsV2
{
    public string Amount { get; set; } = string.Empty; // v2 uses 'amount' instead of 'maxAmountRequired'
    public string Network { get; set; } = string.Empty; // v2 CAIP-2 format: "eip155:84532"
    public string PaymentAddress { get; set; } = string.Empty;
    public long Deadline { get; set; }
    public string Nonce { get; set; } = string.Empty;
    public List<ResourceInfoV2> Accepted { get; set; } = new(); // v2 has nested 'accepted' with ResourceInfo
    public int X402Version { get; set; } = 2;
}

/// <summary>
/// v2 Payment payload structure (current)
/// Sent in PAYMENT-SIGNATURE header
/// </summary>
public class PaymentPayloadV2
{
    public string Signature { get; set; } = string.Empty;
    public string Payer { get; set; } = string.Empty;
    public string Amount { get; set; } = string.Empty;
    public string Nonce { get; set; } = string.Empty;
    public long Deadline { get; set; }
    public string Network { get; set; } = string.Empty; // v2 CAIP-2 format: "eip155:84532"
    public List<ResourceInfoV2> Accepted { get; set; } = new(); // v2 nested structure
    public int X402Version { get; set; } = 2;
}

/// <summary>
/// v2 Settlement response (current)
/// Sent in PAYMENT-RESPONSE header after successful delivery
/// </summary>
public class SettlementResponseV2
{
    public bool Success { get; set; }
    public string Transaction { get; set; } = string.Empty;
    public string? ErrorReason { get; set; }
}
