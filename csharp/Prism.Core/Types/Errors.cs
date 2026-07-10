namespace Prism.Core.Types;

/// <summary>
/// Base exception for all Prism SDK errors, mirroring the TypeScript SDK's
/// PrismError hierarchy (typescript/packages/core/src/types/errors.ts).
/// </summary>
public class PrismError : Exception
{
    public string Code { get; }
    public int StatusCode { get; }
    public object? Details { get; }

    public PrismError(string message, string code, int statusCode, object? details = null)
        : base(message)
    {
        Code = code;
        StatusCode = statusCode;
        Details = details;
    }
}

/// <summary>
/// The Prism Gateway returned an error response (RFC 7807-style problem details).
/// </summary>
public class PrismGatewayError : PrismError
{
    public string? TraceId { get; }
    public string? Timestamp { get; }

    public PrismGatewayError(string message, int statusCode, string? traceId = null, string? timestamp = null, object? details = null)
        : base(message, "GATEWAY_ERROR", statusCode, details)
    {
        TraceId = traceId;
        Timestamp = timestamp;
    }
}

/// <summary>
/// Could not reach the Prism Gateway at all (connection failure, timeout, DNS).
/// </summary>
public class PrismNetworkError : PrismError
{
    public Exception? OriginalError { get; }

    public PrismNetworkError(string message, Exception? originalError = null)
        : base(message, "NETWORK_ERROR", 503, originalError)
    {
        OriginalError = originalError;
    }
}

/// <summary>
/// The SDK itself was misconfigured (e.g. missing API key).
/// </summary>
public class PrismConfigError : PrismError
{
    public PrismConfigError(string message, object? details = null)
        : base(message, "CONFIG_ERROR", 500, details)
    {
    }
}

/// <summary>
/// An application-level payment error constructed by the SDK (not raw gateway data) — safe to
/// forward its Details to the client, unlike PrismGatewayError's.
/// </summary>
public class PrismPaymentError : PrismError
{
    public PrismPaymentError(string message, object? details = null)
        : base(message, "PAYMENT_ERROR", 402, details)
    {
    }
}

/// <summary>
/// Input failed structural/value validation (e.g. an invalid price).
/// </summary>
public class PrismValidationError : PrismError
{
    public string? Field { get; }

    public PrismValidationError(string message, string? field = null, object? details = null)
        : base(message, "VALIDATION_ERROR", 400, details)
    {
        Field = field;
    }
}
