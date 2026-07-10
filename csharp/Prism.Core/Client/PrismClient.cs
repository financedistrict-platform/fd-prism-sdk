using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging;
using Prism.Core.Types;
using Prism.Core.Types.V2;

namespace Prism.Core.Client;

/// <summary>
/// Default <see cref="IPrismClient"/> implementation. Mirrors
/// typescript/packages/core/src/client/prism-client.ts: same endpoints, same 30s fixed
/// timeout, same error-mapping dispatch, same one-level signature redaction in debug logs.
/// </summary>
public class PrismClient : IPrismClient, IDisposable
{
    private const string DefaultBaseUrl = "https://prism-gw.test.1stdigital.tech";

    private readonly HttpClient _httpClient;
    private readonly bool _ownsHttpClient;
    private readonly bool _debug;
    private readonly int _protocolVersion;
    private readonly ILogger<PrismClient>? _logger;

    public PrismClient(PrismMiddlewareConfig config, HttpClient? httpClient = null, ILogger<PrismClient>? logger = null)
    {
        if (string.IsNullOrWhiteSpace(config.ApiKey))
        {
            throw new PrismConfigError("PrismClient: apiKey is required and cannot be empty");
        }

        _debug = config.Debug;
        _protocolVersion = config.X402Version is 1 or 2 ? config.X402Version : 2;
        _logger = logger;

        if (string.IsNullOrEmpty(config.BaseUrl))
        {
            Warn("[PrismClient] No BaseUrl configured — defaulting to test gateway. Set BaseUrl for production.");
        }

        var baseUrl = string.IsNullOrEmpty(config.BaseUrl) ? DefaultBaseUrl : config.BaseUrl;

        _ownsHttpClient = httpClient is null;
        _httpClient = httpClient ?? new HttpClient();
        _httpClient.BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/");
        _httpClient.Timeout = TimeSpan.FromSeconds(30);
        if (!_httpClient.DefaultRequestHeaders.Contains("X-API-Key"))
        {
            _httpClient.DefaultRequestHeaders.Add("X-API-Key", config.ApiKey);
        }
    }

    public async Task<AuthInfoResponse> GetAuthInfoAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.GetAsync(ApiUrl("auth-info"), cancellationToken).ConfigureAwait(false);
            await EnsureSuccessAsync(response, "Get auth info", cancellationToken).ConfigureAwait(false);
            var result = await response.Content.ReadFromJsonAsync<AuthInfoResponse>(PrismJson.Options, cancellationToken).ConfigureAwait(false);
            return result ?? throw new PrismError("Empty response from Prism Gateway", "UNKNOWN_ERROR", 500);
        }
        catch (Exception ex) when (ex is not PrismError)
        {
            LogDebug($"[PrismClient] Get auth info error: {ex.Message}");
            throw MapException(ex, "Get auth info");
        }
    }

    public async Task<PaymentRequiredResponse> GetPaymentRequirementsAsync(PaymentRequirementsRequest request, CancellationToken cancellationToken = default)
    {
        if (_debug)
        {
            LogDebug($"[PrismClient] getPaymentRequirements request: {JsonSerializer.Serialize(request, PrismJson.Options)}");
        }

        try
        {
            var response = await _httpClient.PostAsJsonAsync(ApiUrl("payment/requirements"), request, PrismJson.Options, cancellationToken).ConfigureAwait(false);
            await EnsureSuccessAsync(response, "Get payment requirements", cancellationToken).ConfigureAwait(false);
            var result = await response.Content.ReadFromJsonAsync<PaymentRequiredResponse>(PrismJson.Options, cancellationToken).ConfigureAwait(false)
                ?? throw new PrismError("Empty response from Prism Gateway", "UNKNOWN_ERROR", 500);

            if (_debug)
            {
                LogDebug($"[PrismClient] getPaymentRequirements response: {JsonSerializer.Serialize(result, PrismJson.Options)}");
            }

            return result;
        }
        catch (Exception ex) when (ex is not PrismError)
        {
            LogDebug($"[PrismClient] Get payment requirements error: {ex.Message}");
            throw MapException(ex, "Get payment requirements");
        }
    }

    public async Task<VerifyPaymentResult> VerifyPaymentAsync(JsonElement paymentPayload, PaymentRequirements paymentRequirements, CancellationToken cancellationToken = default)
    {
        if (_debug)
        {
            LogDebug($"[PrismClient] verifyPayment request: {SafeForLog(paymentPayload)}");
        }

        try
        {
            var body = new { paymentPayload, paymentRequirements };
            var response = await _httpClient.PostAsJsonAsync(ApiUrl("payment/verify"), body, PrismJson.Options, cancellationToken).ConfigureAwait(false);
            await EnsureSuccessAsync(response, "Verify payment", cancellationToken).ConfigureAwait(false);

            var doc = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: cancellationToken).ConfigureAwait(false);
            if (_debug)
            {
                LogDebug($"[PrismClient] verifyPayment response: {doc}");
            }

            return new VerifyPaymentResult
            {
                IsValid = doc.ValueKind == JsonValueKind.Object && doc.TryGetProperty("isValid", out var v) && v.ValueKind == JsonValueKind.True,
                Payer = GetOptionalString(doc, "payer"),
                Error = GetOptionalString(doc, "error"),
            };
        }
        catch (Exception ex) when (ex is not PrismError)
        {
            LogDebug($"[PrismClient] Verify payment error: {ex.Message}");
            throw MapException(ex, "Verify payment");
        }
    }

    public async Task<SettlePaymentResult> SettlePaymentAsync(JsonElement paymentPayload, PaymentRequirements paymentRequirements, CancellationToken cancellationToken = default)
    {
        if (_debug)
        {
            LogDebug($"[PrismClient] settlePayment request: {SafeForLog(paymentPayload)}");
        }

        try
        {
            var body = new { paymentPayload, paymentRequirements };
            var response = await _httpClient.PostAsJsonAsync(ApiUrl("payment/settle"), body, PrismJson.Options, cancellationToken).ConfigureAwait(false);
            await EnsureSuccessAsync(response, "Settle payment", cancellationToken).ConfigureAwait(false);

            var doc = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: cancellationToken).ConfigureAwait(false);
            if (_debug)
            {
                LogDebug($"[PrismClient] settlePayment response: {doc}");
            }

            return new SettlePaymentResult
            {
                Success = doc.ValueKind == JsonValueKind.Object && doc.TryGetProperty("success", out var s) && s.ValueKind == JsonValueKind.True,
                Transaction = GetOptionalString(doc, "transaction"),
                Payer = GetOptionalString(doc, "payer"),
                Network = GetOptionalString(doc, "network"),
                ErrorReason = GetOptionalString(doc, "errorReason"),
            };
        }
        catch (Exception ex) when (ex is not PrismError)
        {
            LogDebug($"[PrismClient] Settle payment error: {ex.Message}");
            throw MapException(ex, "Settle payment");
        }
    }

    private string ApiUrl(string relativePath) => $"api/v{_protocolVersion}/{relativePath}";

    private async Task EnsureSuccessAsync(HttpResponseMessage response, string context, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        string? title = null, errorField = null, detail = null, traceId = null, timestamp = null;
        try
        {
            var doc = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: cancellationToken).ConfigureAwait(false);
            title = GetOptionalString(doc, "title");
            errorField = GetOptionalString(doc, "error");
            detail = GetOptionalString(doc, "detail");
            traceId = GetOptionalString(doc, "traceId");
            timestamp = GetOptionalString(doc, "timestamp");
        }
        catch
        {
            // Body wasn't JSON (or was empty) — fall through to the generic message below.
        }

        var message = title ?? errorField ?? $"{context} failed";
        throw new PrismGatewayError(message, (int)response.StatusCode, traceId, timestamp, detail);
    }

    private static Exception MapException(Exception ex, string context)
    {
        if (ex is TaskCanceledException or OperationCanceledException or HttpRequestException)
        {
            return new PrismNetworkError($"Failed to reach Prism Gateway: {ex.Message}", ex);
        }

        return new PrismError(string.IsNullOrEmpty(ex.Message) ? $"{context} failed" : ex.Message, "UNKNOWN_ERROR", 500, ex);
    }

    private static string? GetOptionalString(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object && element.TryGetProperty(propertyName, out var prop) && prop.ValueKind == JsonValueKind.String
            ? prop.GetString()
            : null;
    }

    /// <summary>Shallow-redacts payload.signature before logging, exactly like the TS client's safePayload pattern.</summary>
    private static string SafeForLog(JsonElement payload)
    {
        try
        {
            var node = JsonNode.Parse(payload.GetRawText());
            if (node is JsonObject obj && obj["payload"] is JsonObject payloadObj && payloadObj.ContainsKey("signature"))
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

    private void Warn(string message)
    {
        if (_logger is not null)
        {
            _logger.LogWarning(message);
        }
        else
        {
            Console.Error.WriteLine(message);
        }
    }

    private void LogDebug(string message)
    {
        if (_logger is not null)
        {
            _logger.LogDebug(message);
        }
        else
        {
            Console.WriteLine(message);
        }
    }

    public void Dispose()
    {
        if (_ownsHttpClient)
        {
            _httpClient.Dispose();
        }
    }
}
