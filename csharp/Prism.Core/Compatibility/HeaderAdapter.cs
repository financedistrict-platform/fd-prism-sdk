using Prism.Core.Types.V1;
using Prism.Core.Types.V2;

namespace Prism.Core.Compatibility;

/// <summary>
/// Adapter for reading/writing x402 protocol headers. Supports both v1 and v2 header formats.
/// Deliberately framework-agnostic (no ASP.NET Core dependency): callers pass in delegates
/// for reading/writing a single header, matching the TS (`(name) => string | null`) and
/// Python (`Callable[[str], Optional[str]]`) adapters. Prism.AspNetCore wires these to
/// HttpContext.Request/Response.Headers.
/// </summary>
public static class HeaderAdapter
{
    /// <summary>
    /// Get payment payload from request headers.
    /// Tries both v2 (PAYMENT-SIGNATURE) and v1 (X-PAYMENT) headers, v2 first.
    /// </summary>
    public static string? GetPaymentPayload(Func<string, string?> getHeader)
    {
        var v2Payload = getHeader(V2Headers.PaymentSignature);
        if (!string.IsNullOrEmpty(v2Payload))
        {
            return v2Payload;
        }

        var v1Payload = getHeader(V1Headers.Payment);
        if (!string.IsNullOrEmpty(v1Payload))
        {
            return v1Payload;
        }

        return null;
    }

    /// <summary>
    /// Set payment payload in response headers.
    /// </summary>
    public static void SetPaymentPayload(Action<string, string> setHeader, string payload, int protocolVersion = 2)
    {
        if (protocolVersion == 2)
        {
            setHeader(V2Headers.PaymentSignature, payload);
        }
        else
        {
            setHeader(V1Headers.Payment, payload);
        }
    }

    /// <summary>
    /// Set the "payment required" header (v2 only — v1 conveys requirements via the response body).
    /// </summary>
    public static void SetPaymentRequired(Action<string, string> setHeader, string requirements, int protocolVersion = 2)
    {
        if (protocolVersion == 2)
        {
            setHeader(V2Headers.PaymentRequired, requirements);
        }
    }

    /// <summary>
    /// Get settlement response from response headers.
    /// Tries both v2 (PAYMENT-RESPONSE) and v1 (X-PAYMENT-RESPONSE) headers, v2 first.
    /// </summary>
    public static string? GetSettlementResponse(Func<string, string?> getHeader)
    {
        var v2Response = getHeader(V2Headers.PaymentResponse);
        if (!string.IsNullOrEmpty(v2Response))
        {
            return v2Response;
        }

        var v1Response = getHeader(V1Headers.PaymentResponse);
        if (!string.IsNullOrEmpty(v1Response))
        {
            return v1Response;
        }

        return null;
    }

    /// <summary>
    /// Set settlement response in response headers.
    /// </summary>
    public static void SetSettlementResponse(Action<string, string> setHeader, string response, int protocolVersion = 2)
    {
        if (protocolVersion == 2)
        {
            setHeader(V2Headers.PaymentResponse, response);
        }
        else
        {
            setHeader(V1Headers.PaymentResponse, response);
        }
    }

    /// <summary>
    /// Detect protocol version purely from *which header name is present* (not payload content).
    /// Returns null if neither payment header is present.
    /// </summary>
    public static int? DetectVersionFromHeaders(Func<string, string?> getHeader)
    {
        if (!string.IsNullOrEmpty(getHeader(V2Headers.PaymentSignature)))
        {
            return 2;
        }

        if (!string.IsNullOrEmpty(getHeader(V1Headers.Payment)))
        {
            return 1;
        }

        return null;
    }

    /// <summary>All header names a client might send a payment payload in, v2 first.</summary>
    public static string[] GetAllPaymentHeaders() => new[] { V2Headers.PaymentSignature, V1Headers.Payment };

    /// <summary>All header names a settlement response might be found in, v2 first.</summary>
    public static string[] GetAllResponseHeaders() => new[] { V2Headers.PaymentResponse, V1Headers.PaymentResponse, V2Headers.PaymentRequired };
}
