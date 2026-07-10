namespace Prism.Core.Client;

/// <summary>Result of PrismClient.VerifyPaymentAsync.</summary>
public class VerifyPaymentResult
{
    public bool IsValid { get; set; }
    public string? Payer { get; set; }
    public string? Error { get; set; }
}

/// <summary>Result of PrismClient.SettlePaymentAsync. Only these fields are read from the
/// gateway's response, mirroring the TS client's explicit-field-copy behavior.</summary>
public class SettlePaymentResult
{
    public bool Success { get; set; }
    public string? Transaction { get; set; }
    public string? Payer { get; set; }
    public string? Network { get; set; }
    public string? ErrorReason { get; set; }
}
