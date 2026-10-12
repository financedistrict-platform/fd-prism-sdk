using System.Text.Json;
using Prism.Core.Types.V2;

namespace Prism.Core.Middleware;

/// <summary>Input to <see cref="PrismMiddlewareCore.HandleRequestAsync"/>, built by a framework adapter.</summary>
public class MiddlewareRequestData
{
    public string Path { get; set; } = string.Empty;
    public string? PaymentHeader { get; set; }
    public string ResourceUrl { get; set; } = string.Empty;

    /// <summary>If null, the core auto-detects from <see cref="PaymentHeader"/> or falls back to the configured default.</summary>
    public int? ProtocolVersion { get; set; }
}

/// <summary>
/// Present only once a payment has been cryptographically verified by the gateway.
/// The adapter is responsible for calling <see cref="PrismMiddlewareCore.SettlementCallbackAsync"/>
/// after the protected handler completes.
/// </summary>
public class PaymentInfo
{
    public JsonElement Payment { get; set; }
    public string Payer { get; set; } = string.Empty;
    public PaymentRequirements PaymentRequirements { get; set; } = new();
    public int ProtocolVersion { get; set; }
}

/// <summary>Result of <see cref="PrismMiddlewareCore.HandleRequestAsync"/>.</summary>
public class MiddlewareResult
{
    /// <summary>
    /// True when the middleware has already produced a final response (402/400/error) and the
    /// adapter must write it and short-circuit — the protected handler must NOT run.
    /// </summary>
    public bool Handled { get; set; }

    public int? StatusCode { get; set; }
    public Dictionary<string, string>? Headers { get; set; }
    public object? Body { get; set; }

    /// <summary>Set when payment was verified (Handled is false) so the adapter can expose it to
    /// the protected handler and later call SettlementCallbackAsync.</summary>
    public PaymentInfo? PaymentInfo { get; set; }
}
