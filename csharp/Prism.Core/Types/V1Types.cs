using Prism.Core.Types;

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
/// v1 Payment payload structure (legacy, flat shape).
/// Sent base64-encoded in the X-PAYMENT header.
/// </summary>
public class PaymentPayloadV1
{
    public int X402Version { get; set; } = 1;
    public string Scheme { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty; // v1 format: "base-sepolia"
    public SignedPayload Payload { get; set; } = new();
}

/// <summary>
/// v1 Payment requirements (legacy).
/// Returned in the 402 response body / X-PAYMENT-REQUIREMENTS header.
/// </summary>
public class PaymentRequirementsV1
{
    public string Scheme { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty; // v1 format: "base-sepolia"
    public string MaxAmountRequired { get; set; } = string.Empty; // v1 uses maxAmountRequired
    public string Resource { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
    public object? OutputSchema { get; set; }
    public string PayTo { get; set; } = string.Empty;
    public int MaxTimeoutSeconds { get; set; }
    public string Asset { get; set; } = string.Empty;
    public object? Extra { get; set; }
}

/// <summary>
/// v1 Payment-required response (legacy).
/// </summary>
public class PaymentRequiredResponseV1
{
    public int X402Version { get; set; } = 1;
    public string Error { get; set; } = string.Empty;
    public List<PaymentRequirementsV1> Accepts { get; set; } = new();
}

/// <summary>
/// v1 Settlement response (legacy).
/// Sent base64-encoded in the X-PAYMENT-RESPONSE header after successful settlement.
/// </summary>
public class SettlementResponseV1
{
    public bool Success { get; set; }
    public string? ErrorReason { get; set; }
    public string Transaction { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty;
    public string Payer { get; set; } = string.Empty; // required in v1, unlike v2
}
