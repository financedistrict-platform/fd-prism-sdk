namespace Prism.Core.Types;

/// <summary>
/// Configuration for <see cref="Client.PrismClient"/> and <see cref="Middleware.PrismMiddlewareCore"/>.
/// </summary>
public class PrismMiddlewareConfig
{
    /// <summary>Required. The API key used to authenticate with the Prism Gateway.</summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>Gateway base URL. Defaults to the test gateway if not set (a warning is logged).</summary>
    public string? BaseUrl { get; set; }

    /// <summary>Enables verbose, signature-redacted request/response logging.</summary>
    public bool Debug { get; set; }

    /// <summary>Default protocol version to use/expect when a request doesn't specify one. Default 2.</summary>
    public int X402Version { get; set; } = 2;

    /// <summary>
    /// Whitelist of client protocol versions this server will accept. Defaults to [2] only —
    /// v1 is rejected unless explicitly opted into. Prevents protocol-downgrade attacks.
    /// </summary>
    public int[]? AllowedVersions { get; set; }

    /// <summary>
    /// Overrides the Host-header-derived resource URL. Always prefer this over the raw
    /// Host header in production to prevent Host-header injection.
    /// </summary>
    public string? ResourceBaseUrl { get; set; }
}

/// <summary>
/// Per-route payment configuration. <see cref="Price"/> may be a numeric type (double/int/decimal)
/// or a currency-prefixed string (e.g. "$0.01"), mirroring the TypeScript SDK's `number | string`.
/// </summary>
public class RoutePaymentConfig
{
    public object Price { get; set; } = 0d;
    public string? Description { get; set; }
    public string? MimeType { get; set; }
    public int? MaxTimeoutSeconds { get; set; }
    public string? Resource { get; set; }
    public bool SettleBeforeHandler { get; set; }
}

/// <summary>
/// Request body for GET /payment/requirements.
/// </summary>
public class PaymentRequirementsRequest
{
    public string ResourceUrl { get; set; } = string.Empty;
    public double RequestedAmount { get; set; }
    public string Description { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
}

/// <summary>
/// Response from GET /auth-info.
/// </summary>
public class AuthInfoResponse
{
    public string Timestamp { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientName { get; set; } = string.Empty;
    public string PointOfServiceId { get; set; } = string.Empty;
    public List<string> Scopes { get; set; } = new();
}
