using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Prism.Core.Client;
using Prism.Core.Compatibility;
using Prism.Core.Middleware;
using Prism.Core.Types;

namespace Prism.AspNetCore.Middleware;

/// <summary>
/// ASP.NET Core integration for the x402 payment flow. Conventional middleware — register via
/// <c>app.UseMiddleware&lt;PrismPaymentMiddleware&gt;(config, routes)</c> (or the
/// <c>UsePrism</c> extension, which does this for you).
///
/// This is the ASP.NET Core equivalent of the Express adapter's `res.end` monkey-patch: the
/// downstream response is buffered in memory so settlement can run — and, on failure, the
/// response can be rewritten to a 402/500 — *before* anything is actually sent to the client.
/// </summary>
public class PrismPaymentMiddleware
{
    private readonly RequestDelegate _next;
    private readonly PrismMiddlewareConfig _config;
    private readonly PrismMiddlewareCore _core;

    public PrismPaymentMiddleware(RequestDelegate next, PrismMiddlewareConfig config, IReadOnlyDictionary<string, RoutePaymentConfig> routes)
    {
        _next = next;
        _config = config;
        _core = new PrismMiddlewareCore(config, routes);
    }

    /// <summary>Test-only seam: lets Prism.Tests supply a PrismMiddlewareCore built against a fake IPrismClient.</summary>
    internal PrismPaymentMiddleware(RequestDelegate next, PrismMiddlewareConfig config, PrismMiddlewareCore core)
    {
        _next = next;
        _config = config;
        _core = core;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var request = context.Request;

        // Prefer the configured base URL over the (spoofable) Host header — prevents Host-header injection.
        var baseUrl = (_config.ResourceBaseUrl ?? $"{request.Scheme}://{request.Host}").TrimEnd('/');
        var resourceUrl = baseUrl + request.Path + request.QueryString;

        var paymentHeader = HeaderAdapter.GetPaymentPayload(name => request.Headers.TryGetValue(name, out var v) ? v.ToString() : null);

        var protocolVersion = _config.X402Version is 1 or 2 ? _config.X402Version : 2;
        if (!string.IsNullOrEmpty(paymentHeader))
        {
            var detected = VersionDetector.DetectProtocolVersion(paymentHeader);
            if (detected.HasValue)
            {
                protocolVersion = detected.Value;
            }
        }

        var result = await _core.HandleRequestAsync(new MiddlewareRequestData
        {
            Path = request.Path,
            PaymentHeader = paymentHeader,
            ResourceUrl = resourceUrl,
            ProtocolVersion = protocolVersion,
        }).ConfigureAwait(false);

        if (result.Handled)
        {
            var response = context.Response;
            response.StatusCode = result.StatusCode ?? 500;
            if (result.Headers is not null)
            {
                foreach (var (key, value) in result.Headers)
                {
                    response.Headers[key] = value;
                }
            }

            await response.WriteAsync(JsonSerializer.Serialize(result.Body, PrismJson.Options)).ConfigureAwait(false);
            return; // short-circuit — the protected handler never runs.
        }

        if (result.PaymentInfo is not null)
        {
            context.Items["Prism.PaymentInfo"] = result.PaymentInfo;
            await RunWithSettlementAsync(context, result.PaymentInfo).ConfigureAwait(false);
            return;
        }

        // Unprotected route — no buffering overhead, nothing to settle.
        await _next(context).ConfigureAwait(false);
    }

    private async Task RunWithSettlementAsync(HttpContext context, PaymentInfo paymentInfo)
    {
        var response = context.Response;
        var originalBody = response.Body;
        using var buffer = new MemoryStream();
        response.Body = buffer;

        try
        {
            await _next(context).ConfigureAwait(false);

            if (response.StatusCode >= 400)
            {
                // The handler's own error response passes through untouched — no settlement attempt,
                // mirroring PrismMiddlewareCore.SettlementCallbackAsync's own >=400 short-circuit.
                await FlushBufferAsync(buffer, originalBody).ConfigureAwait(false);
                return;
            }

            SettlePaymentResult? settlementResult;
            try
            {
                settlementResult = await _core.SettlementCallbackAsync(paymentInfo.Payment, paymentInfo.PaymentRequirements, response.StatusCode).ConfigureAwait(false);
            }
            catch (Exception)
            {
                response.Body = originalBody;
                await WriteSettlementFailureAsync(context, paymentInfo.ProtocolVersion, 500, "Settlement processing error", "An error occurred while settling the payment. Please try again.").ConfigureAwait(false);
                return;
            }

            if (settlementResult is { Success: true } && !string.IsNullOrEmpty(settlementResult.Transaction))
            {
                var settlementJson = JsonSerializer.Serialize(settlementResult, PrismJson.Options);
                var settlementBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(settlementJson));
                HeaderAdapter.SetSettlementResponse((name, value) => response.Headers[name] = value, settlementBase64, paymentInfo.ProtocolVersion);

                await FlushBufferAsync(buffer, originalBody).ConfigureAwait(false);
            }
            else
            {
                response.Body = originalBody;
                var errorReason = settlementResult?.ErrorReason ?? "Settlement processing failed";
                await WriteSettlementFailureAsync(context, paymentInfo.ProtocolVersion, 402, "Payment settlement failed", errorReason).ConfigureAwait(false);
            }
        }
        finally
        {
            response.Body = originalBody;
        }
    }

    private static async Task FlushBufferAsync(MemoryStream buffer, Stream originalBody)
    {
        buffer.Seek(0, SeekOrigin.Begin);
        await buffer.CopyToAsync(originalBody).ConfigureAwait(false);
    }

    private static async Task WriteSettlementFailureAsync(HttpContext context, int protocolVersion, int statusCode, string error, string details)
    {
        var response = context.Response;
        response.Headers.Clear();
        response.StatusCode = statusCode;
        response.ContentType = "application/json";
        var body = JsonSerializer.Serialize(new { x402Version = protocolVersion, error, details }, PrismJson.Options);
        await response.WriteAsync(body).ConfigureAwait(false);
    }
}
