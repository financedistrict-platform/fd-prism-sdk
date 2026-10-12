using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Prism.Core.Client;
using Prism.Core.Compatibility;
using Prism.Core.Types;
using Prism.Core.Types.V2;
using Prism.Core.Utils;

namespace Prism.Core.Middleware;

/// <summary>
/// Framework-agnostic x402 payment verification/settlement flow. Faithful port of
/// typescript/packages/core/src/middleware/middleware-core.ts, including every security
/// fix present in the TS source as of this port (header-size guard, structural payload
/// validation, protocol-version whitelist, no leaking of gateway/exception details to
/// the client, signature redaction in debug logs).
/// </summary>
public class PrismMiddlewareCore
{
    /// <summary>~10x the size of a real x402 payload — guards against decoding huge attacker input.</summary>
    private const int MaxPaymentHeaderBytes = 8192;

    private readonly IPrismClient _client;
    private readonly bool _debug;
    private readonly int _defaultProtocolVersion;
    private readonly int[] _allowedVersions;
    private readonly IReadOnlyDictionary<string, RoutePaymentConfig> _routes;
    private readonly ILogger<PrismMiddlewareCore>? _logger;
    private readonly Func<DateTimeOffset> _utcNow;

    public PrismMiddlewareCore(
        PrismMiddlewareConfig config,
        IReadOnlyDictionary<string, RoutePaymentConfig> routes,
        IPrismClient? client = null,
        ILogger<PrismMiddlewareCore>? logger = null,
        Func<DateTimeOffset>? utcNow = null)
    {
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
        _debug = config.Debug;
        _client = client ?? new PrismClient(config);
        _defaultProtocolVersion = config.X402Version is 1 or 2 ? config.X402Version : 2;
        _allowedVersions = config.AllowedVersions ?? new[] { 2 };
        _routes = routes;
        _logger = logger;
    }

    public async Task<MiddlewareResult> HandleRequestAsync(MiddlewareRequestData requestData)
    {
        var path = requestData.Path;
        var paymentHeader = requestData.PaymentHeader;
        var resourceUrl = requestData.ResourceUrl;
        var protocolVersion = requestData.ProtocolVersion ?? _defaultProtocolVersion;

        // Only auto-detect from the raw header when the caller didn't explicitly pin a version.
        if (!string.IsNullOrEmpty(paymentHeader) && requestData.ProtocolVersion is null)
        {
            var detected = VersionDetector.DetectProtocolVersion(paymentHeader);
            if (detected.HasValue)
            {
                protocolVersion = detected.Value;
            }
        }

        LogDebug($"[PrismMiddlewareCore] path={path} hasPaymentHeader={!string.IsNullOrEmpty(paymentHeader)} resourceUrl={resourceUrl} protocolVersion={protocolVersion}");

        var matchedRoute = RouteMatcher.FindMatchingRoute(path, _routes);
        if (matchedRoute is null)
        {
            LogDebug($"[PrismMiddlewareCore] No matching route for {path} — passing through unprotected.");
            return new MiddlewareResult { Handled = false };
        }

        var routeConfig = _routes[matchedRoute];
        LogDebug($"[PrismMiddlewareCore] Matched route: {matchedRoute}");

        if (string.IsNullOrEmpty(paymentHeader))
        {
            LogDebug("[PrismMiddlewareCore] No payment header — issuing 402.");
            return await HandleNoPaymentAsync(routeConfig, resourceUrl, protocolVersion).ConfigureAwait(false);
        }

        LogDebug("[PrismMiddlewareCore] Payment header present — verifying.");
        return await HandlePaymentVerificationAsync(paymentHeader, routeConfig, resourceUrl, protocolVersion).ConfigureAwait(false);
    }

    private async Task<MiddlewareResult> HandleNoPaymentAsync(RoutePaymentConfig routeConfig, string resourceUrl, int protocolVersion)
    {
        try
        {
            var price = PriceParser.ParsePrice(routeConfig.Price);
            LogDebug($"[PrismMiddlewareCore] Parsed price: {price}");

            var request = new PaymentRequirementsRequest
            {
                ResourceUrl = resourceUrl,
                RequestedAmount = price,
                Description = routeConfig.Description ?? "Payment required",
                MimeType = routeConfig.MimeType ?? "application/json",
            };

            var paymentRequirements = await _client.GetPaymentRequirementsAsync(request).ConfigureAwait(false);

            LogDebug($"[PrismMiddlewareCore] Returning 402 with requirements (v{protocolVersion}).");
            var response = ResponseBuilder.Build402Response(paymentRequirements, protocolVersion);
            return ToResult(response);
        }
        catch (Exception error)
        {
            LogError($"Error generating payment requirements: {error}");
            var response = ResponseBuilder.BuildErrorResponse(error, "requirements", protocolVersion, LogError);
            return ToResult(response);
        }
    }

    private async Task<MiddlewareResult> HandlePaymentVerificationAsync(string paymentHeader, RoutePaymentConfig routeConfig, string resourceUrl, int protocolVersion)
    {
        try
        {
            var decoded = DecodePaymentHeader(paymentHeader);
            if (decoded is null)
            {
                return ToResult(ResponseBuilder.BuildInvalidPaymentHeaderResponse(protocolVersion));
            }

            var payload = decoded.Value;

            var payloadVersion = VersionDetector.DetectProtocolVersion(payload);
            if (payloadVersion.HasValue && payloadVersion.Value != protocolVersion)
            {
                if (!_allowedVersions.Contains(payloadVersion.Value))
                {
                    LogDebug($"[PrismMiddlewareCore] Payload version {payloadVersion} not in allowed versions — rejecting.");
                    // Deliberately uses the configured default (not the mismatched values) for the response's x402Version.
                    return ToResult(ResponseBuilder.BuildInvalidPaymentHeaderResponse(_defaultProtocolVersion));
                }

                LogDebug($"[PrismMiddlewareCore] Payload declares version {payloadVersion}, overriding negotiated version {protocolVersion}.");
                protocolVersion = payloadVersion.Value;
            }

            LogDebug($"[PrismMiddlewareCore] Parsed payment payload (v{protocolVersion}): {RedactSignature(payload)}");

            var price = PriceParser.ParsePrice(routeConfig.Price);
            LogDebug($"[PrismMiddlewareCore] Parsed price: {price}");

            var request = new PaymentRequirementsRequest
            {
                ResourceUrl = resourceUrl,
                RequestedAmount = price,
                Description = routeConfig.Description ?? "Payment required",
                MimeType = routeConfig.MimeType ?? "application/json",
            };

            var paymentRequirementsResponse = await _client.GetPaymentRequirementsAsync(request).ConfigureAwait(false);
            var paymentRequirements = PaymentValidator.FindRequirementForPayment(paymentRequirementsResponse.Accepts, payload);

            if (paymentRequirements is null)
            {
                LogDebug($"[PrismMiddlewareCore] No matching payment requirement found for payment: {RedactSignature(payload)}");
                return ToResult(ResponseBuilder.BuildInvalidPaymentResponse("No matching payment requirement found for the provided payment", protocolVersion));
            }

            var expectedResourceUrl = string.IsNullOrEmpty(paymentRequirementsResponse.Resource?.Url)
                ? resourceUrl
                : paymentRequirementsResponse.Resource.Url;
            var mismatch = PaymentValidator.ValidateBinding(payload, paymentRequirements)
                ?? PaymentValidator.ValidateResource(payload, expectedResourceUrl)
                ?? PaymentValidator.ValidateWindow(payload, _utcNow());
            if (mismatch is not null)
            {
                LogDebug($"[PrismMiddlewareCore] Payment rejected locally: {mismatch}");
                return ToResult(ResponseBuilder.BuildInvalidPaymentResponse(mismatch, protocolVersion));
            }

            var verificationResult = await _client.VerifyPaymentAsync(payload, paymentRequirements).ConfigureAwait(false);
            if (!verificationResult.IsValid)
            {
                LogDebug($"[PrismMiddlewareCore] Payment verification failed: {verificationResult.Error}");
                return ToResult(ResponseBuilder.BuildInvalidPaymentResponse(verificationResult.Error, protocolVersion));
            }

            LogDebug($"[PrismMiddlewareCore] Payment verified. Payer: {verificationResult.Payer}");

            return new MiddlewareResult
            {
                Handled = false,
                PaymentInfo = new PaymentInfo
                {
                    Payment = payload,
                    Payer = verificationResult.Payer ?? string.Empty,
                    PaymentRequirements = paymentRequirements,
                    ProtocolVersion = protocolVersion,
                },
            };
        }
        catch (Exception error)
        {
            LogError($"Error processing payment: {error}");
            var response = ResponseBuilder.BuildErrorResponse(error, "payment", protocolVersion, LogError);
            return ToResult(response);
        }
    }

    /// <summary>
    /// Decodes and structurally validates the client-supplied payment header. Returns null
    /// (never throws) on any decode failure or structural-shape failure — callers must treat
    /// null as "invalid payment header" (400), never forward it further.
    /// </summary>
    private JsonElement? DecodePaymentHeader(string paymentHeader)
    {
        if (paymentHeader.Length > MaxPaymentHeaderBytes)
        {
            LogDebug($"[PrismMiddlewareCore] Payment header exceeds max size ({paymentHeader.Length} > {MaxPaymentHeaderBytes}).");
            return null;
        }

        try
        {
            var decodedBytes = Convert.FromBase64String(paymentHeader);
            var decodedString = Encoding.UTF8.GetString(decodedBytes);
            using var doc = JsonDocument.Parse(decodedString);
            var root = doc.RootElement.Clone();

            if (!IsValidPaymentPayloadShape(root))
            {
                LogDebug("[PrismMiddlewareCore] Payment payload failed structural validation.");
                return null;
            }

            return root;
        }
        catch (Exception ex)
        {
            LogDebug($"[PrismMiddlewareCore] Failed to decode payment header: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Structural (not cryptographic) validation of a decoded payment payload. Mirrors TS's
    /// isValidPaymentPayloadShape exactly: v2 requires accepted.{scheme,network,asset} plus
    /// payload.{signature, authorization.{from,to,value,validAfter,validBefore,nonce}}; anything
    /// not explicitly x402Version==2 falls back to the v1 flat shape (scheme/network at top
    /// level, same payload/authorization requirement).
    /// </summary>
    private static bool IsValidPaymentPayloadShape(JsonElement candidate)
    {
        if (candidate.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        var isV2 = candidate.TryGetProperty("x402Version", out var versionEl)
            && versionEl.ValueKind == JsonValueKind.Number
            && versionEl.TryGetInt32(out var version)
            && version == 2;

        if (isV2)
        {
            if (!candidate.TryGetProperty("accepted", out var accepted) || accepted.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            if (!HasNonEmptyString(accepted, "scheme") || !HasNonEmptyString(accepted, "network") || !HasNonEmptyString(accepted, "asset"))
            {
                return false;
            }
        }
        else
        {
            if (!HasNonEmptyString(candidate, "scheme") || !HasNonEmptyString(candidate, "network"))
            {
                return false;
            }
        }

        return candidate.TryGetProperty("payload", out var payload) && IsValidPayload(payload);
    }

    private static bool IsValidPayload(JsonElement payload)
    {
        if (payload.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        if (!HasNonEmptyString(payload, "signature"))
        {
            return false;
        }

        if (!payload.TryGetProperty("authorization", out var authorization) || authorization.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        return HasNonEmptyString(authorization, "from")
            && HasNonEmptyString(authorization, "to")
            && HasNonEmptyString(authorization, "value")
            && HasNonEmptyString(authorization, "validAfter")
            && HasNonEmptyString(authorization, "validBefore")
            && HasNonEmptyString(authorization, "nonce");
    }

    private static bool HasNonEmptyString(JsonElement obj, string propertyName)
    {
        return obj.ValueKind == JsonValueKind.Object
            && obj.TryGetProperty(propertyName, out var prop)
            && prop.ValueKind == JsonValueKind.String
            && !string.IsNullOrEmpty(prop.GetString());
    }

    /// <summary>
    /// Attempts settlement for a verified payment. Returns null (never throws) without calling
    /// the gateway when <paramref name="statusCode"/> is an error status — settlement is only
    /// ever attempted for successful responses.
    /// </summary>
    public async Task<SettlePaymentResult?> SettlementCallbackAsync(JsonElement payment, PaymentRequirements paymentRequirements, int statusCode)
    {
        if (statusCode >= 400)
        {
            return null;
        }

        var mismatch = PaymentValidator.ValidateBinding(payment, paymentRequirements);
        if (mismatch is not null)
        {
            LogError($"Settlement refused: {mismatch}");
            return new SettlePaymentResult { Success = false, ErrorReason = mismatch };
        }

        try
        {
            var result = await _client.SettlePaymentAsync(payment, paymentRequirements).ConfigureAwait(false);

            if (result.Success && !string.IsNullOrEmpty(result.Transaction))
            {
                LogError($"Payment settled: {result.Transaction} on {result.Network ?? "unknown"} by {result.Payer}");
            }
            else if (!string.IsNullOrEmpty(result.ErrorReason))
            {
                LogError($"Settlement failed: {result.ErrorReason}");
            }

            return result;
        }
        catch (Exception error)
        {
            LogError($"Error during settlement: {error}");
            return null;
        }
    }

    private static MiddlewareResult ToResult(MiddlewareResponse response) => new()
    {
        Handled = true,
        StatusCode = response.StatusCode,
        Headers = response.Headers,
        Body = response.Body,
    };

    private static string RedactSignature(JsonElement payload)
    {
        try
        {
            var node = System.Text.Json.Nodes.JsonNode.Parse(payload.GetRawText());
            if (node is System.Text.Json.Nodes.JsonObject obj && obj["payload"] is System.Text.Json.Nodes.JsonObject payloadObj && payloadObj.ContainsKey("signature"))
            {
                payloadObj["signature"] = "[REDACTED]";
            }

            return node?.ToJsonString() ?? payload.GetRawText();
        }
        catch
        {
            return "[unloggable payload]";
        }
    }

    private void LogDebug(string message)
    {
        if (!_debug)
        {
            return;
        }

        if (_logger is not null)
        {
            _logger.LogDebug(message);
        }
        else
        {
            Console.WriteLine(message);
        }
    }

    private void LogError(string message)
    {
        if (_logger is not null)
        {
            _logger.LogError(message);
        }
        else
        {
            Console.Error.WriteLine(message);
        }
    }
}
