using Prism.Core.Types;

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
/// Describes the protected resource a set of payment requirements applies to.
/// </summary>
public class ResourceInfo
{
    public string Url { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? MimeType { get; set; }
}

/// <summary>
/// v2 Payment requirements (current standard) — one accepted payment option.
/// </summary>
public class PaymentRequirements
{
    public string Scheme { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty; // v2 CAIP-2 format: "eip155:84532"
    public string Amount { get; set; } = string.Empty; // v2 uses 'amount' instead of 'maxAmountRequired'
    public string Asset { get; set; } = string.Empty;
    public string PayTo { get; set; } = string.Empty;
    public int MaxTimeoutSeconds { get; set; }
    public Dictionary<string, object>? Extra { get; set; }
}

/// <summary>
/// v2 Payment-required response. Returned in the 402 body and (base64-encoded)
/// in the PAYMENT-REQUIRED header.
/// </summary>
public class PaymentRequiredResponse
{
    public int X402Version { get; set; } = 2;
    public string? Error { get; set; }
    public ResourceInfo Resource { get; set; } = new();
    public List<PaymentRequirements> Accepts { get; set; } = new();
    public Dictionary<string, object>? Extensions { get; set; }
}

/// <summary>
/// v2 Payment payload structure (current). Sent base64-encoded in the
/// PAYMENT-SIGNATURE header. Note: the SDK never deserializes an incoming
/// client payload into this type — see <see cref="System.Text.Json.JsonElement"/>
/// usage in PrismMiddlewareCore for why. This type describes the shape for
/// documentation/interop purposes and for payloads the SDK itself constructs.
/// </summary>
public class PaymentPayload
{
    public int X402Version { get; set; } = 2;
    public ResourceInfo? Resource { get; set; }
    public PaymentRequirements Accepted { get; set; } = new();
    public SignedPayload Payload { get; set; } = new();
    public Dictionary<string, object>? Extensions { get; set; }
}

/// <summary>
/// v2 Settlement response (current). Sent base64-encoded in the
/// PAYMENT-RESPONSE header after successful settlement.
/// </summary>
public class SettlementResponse
{
    public bool Success { get; set; }
    public string? ErrorReason { get; set; }
    public string Transaction { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty;
    public string? Payer { get; set; } // optional in v2, unlike v1
}
