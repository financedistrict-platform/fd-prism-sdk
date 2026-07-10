namespace Prism.Core.Types;

/// <summary>
/// EIP-3009 transfer authorization. Identical shape in both x402 v1 and v2 payloads.
/// </summary>
public class PaymentAuthorization
{
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string ValidAfter { get; set; } = string.Empty;
    public string ValidBefore { get; set; } = string.Empty;
    public string Nonce { get; set; } = string.Empty;
}

/// <summary>
/// The signed payload wrapper carried by both x402 v1 and v2 payment payloads.
/// </summary>
public class SignedPayload
{
    public string Signature { get; set; } = string.Empty;
    public PaymentAuthorization Authorization { get; set; } = new();
}
