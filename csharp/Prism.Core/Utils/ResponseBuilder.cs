using System.Text;
using System.Text.Json;
using Prism.Core.Types;
using Prism.Core.Types.V2;

namespace Prism.Core.Utils;

/// <summary>
/// A shaped middleware response: status code, headers, and a JSON-serializable body.
/// </summary>
public class MiddlewareResponse
{
    public int StatusCode { get; set; }
    public Dictionary<string, string> Headers { get; set; } = new();
    public object? Body { get; set; }
}

/// <summary>
/// Builds the response bodies/headers the middleware core returns to callers.
/// Mirrors typescript/packages/core/src/utils/response-builder.ts, including the fix that
/// stops forwarding gateway-provided error `Details` (or raw exception text) to the
/// untrusted client — those are logged server-side only.
/// </summary>
public static class ResponseBuilder
{
    public static MiddlewareResponse Build402Response(PaymentRequiredResponse requirements, int protocolVersion = 2)
    {
        var requirementsJson = JsonSerializer.Serialize(requirements, PrismJson.Options);
        var requirementsBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(requirementsJson));

        var headers = new Dictionary<string, string> { ["Content-Type"] = "application/json" };
        if (protocolVersion == 1)
        {
            headers["X-PAYMENT-REQUIREMENTS"] = requirementsBase64;
        }
        else
        {
            headers["PAYMENT-REQUIRED"] = requirementsBase64;
            headers["X-PAYMENT-REQUIREMENTS"] = requirementsBase64; // legacy header, kept for backward compat
        }

        return new MiddlewareResponse { StatusCode = 402, Headers = headers, Body = requirements };
    }

    public static MiddlewareResponse BuildErrorResponse(Exception error, string context, int protocolVersion = 2, Action<string>? logServerSide = null)
    {
        var headers = new Dictionary<string, string> { ["Content-Type"] = "application/json" };

        switch (error)
        {
            case PrismGatewayError gatewayError:
                // Gateway `Details` is deliberately never included in the client-facing body — log it server-side only.
                logServerSide?.Invoke($"[BuildErrorResponse] Gateway error details: {gatewayError.Details}");
                return new MiddlewareResponse
                {
                    StatusCode = gatewayError.StatusCode,
                    Headers = headers,
                    Body = new
                    {
                        x402Version = protocolVersion,
                        error = context == "requirements" ? gatewayError.Message : "Payment processing failed",
                        gateway = new { traceId = gatewayError.TraceId, timestamp = gatewayError.Timestamp },
                    },
                };

            case PrismNetworkError:
                return new MiddlewareResponse
                {
                    StatusCode = 503,
                    Headers = headers,
                    Body = new
                    {
                        x402Version = protocolVersion,
                        error = "Payment service unavailable",
                        details = "Could not connect to Prism Gateway. Please try again later.",
                        retryAfter = 60,
                    },
                };

            case PrismPaymentError paymentError:
                // Constructed by the SDK itself (not raw gateway/exception data) — safe to forward Details.
                return new MiddlewareResponse
                {
                    StatusCode = 402,
                    Headers = headers,
                    Body = new { x402Version = protocolVersion, error = paymentError.Message, details = paymentError.Details },
                };

            default:
                logServerSide?.Invoke($"[BuildErrorResponse] Unexpected error ({context}): {error}");
                return new MiddlewareResponse
                {
                    StatusCode = 500,
                    Headers = headers,
                    Body = new
                    {
                        x402Version = protocolVersion,
                        error = context == "requirements" ? "Failed to generate payment requirements" : "Failed to process payment",
                        details = "An unexpected error occurred",
                    },
                };
        }
    }

    public static MiddlewareResponse BuildInvalidPaymentHeaderResponse(int protocolVersion = 2)
    {
        return new MiddlewareResponse
        {
            StatusCode = 400,
            Headers = new Dictionary<string, string> { ["Content-Type"] = "application/json" },
            Body = new
            {
                x402Version = protocolVersion,
                error = "Invalid payment header format",
                details = "X-PAYMENT header must be valid JSON",
            },
        };
    }

    public static MiddlewareResponse BuildInvalidPaymentResponse(string? error = null, int protocolVersion = 2)
    {
        return new MiddlewareResponse
        {
            StatusCode = 402,
            Headers = new Dictionary<string, string> { ["Content-Type"] = "application/json" },
            Body = new { x402Version = protocolVersion, error = error ?? "Invalid payment" },
        };
    }
}
