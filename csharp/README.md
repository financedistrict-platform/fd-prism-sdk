# Prism SDK for .NET

> **Status:** ✅ Available — ASP.NET Core middleware for the x402 payment protocol

A .NET SDK for integrating the Prism payment gateway with ASP.NET Core applications. Protects any route with a micropayment: unpaid requests get a `402 Payment Required` challenge, paid requests are cryptographically verified against the Prism Gateway before your handler runs, and settlement happens automatically after it responds.

## Features

- ASP.NET Core middleware (works with both Minimal APIs and MVC controllers)
- Multi-targets .NET 6.0, 7.0, and 8.0
- On-demand payment requirements generation
- x402 protocol v1 and v2, with automatic version detection and a configurable version whitelist (v2-only by default)
- Structural validation of client-supplied payment payloads before anything is forwarded to the gateway
- Verify-then-settle flow: the response is buffered so settlement can run before anything is sent to the client, and the response is rewritten to a 402/500 if settlement fails
- Async/await throughout
- Dependency injection support (`AddPrism`/`UsePrism`)
- Optional `ILogger` integration for debug logging (falls back to console output if none is configured)
- xUnit test suite covering the core payment-verification/settlement logic

Not yet implemented: cloud-hosted or file-based configuration modes (only `on-demand` mode exists, same as the TypeScript and Python SDKs).

## Architecture

```
csharp/
├── Prism.Core/                        # Framework-agnostic core — no ASP.NET Core dependency
│   ├── Client/                        # IPrismClient, PrismClient, VerifyPaymentResult/SettlePaymentResult
│   ├── Compatibility/                 # HeaderAdapter, NetworkMapper, VersionDetector
│   ├── Middleware/                    # PrismMiddlewareCore (the verify/settle flow) + result types
│   ├── Types/                         # v1/v2 wire types, PrismMiddlewareConfig, RoutePaymentConfig, error hierarchy
│   └── Utils/                         # RouteMatcher, PriceParser, ResponseBuilder
├── Prism.AspNetCore/                  # ASP.NET Core integration
│   ├── Middleware/PrismPaymentMiddleware.cs
│   └── Extensions/                    # AddPrism / UsePrism / HttpContext accessors
├── Prism.Tests/                       # xUnit
└── Prism.SDK.sln
```

## Installation

Not yet published to NuGet — reference the project directly until then:

```bash
git clone <this-repo>
cd csharp
dotnet add <YourProject>.csproj reference Prism.AspNetCore/Prism.AspNetCore.csproj
```

## Usage

```csharp
// Program.cs
using Prism.AspNetCore.Extensions;
using Prism.Core.Types;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddPrism(options =>
{
    options.ApiKey = builder.Configuration["Prism:ApiKey"]!;
    options.BaseUrl = "https://prism-gw.test.1stdigital.tech";
    // Prefer an explicit resource base URL over the Host header in production
    // (prevents Host-header spoofing of the resource identifier sent to the gateway).
    options.ResourceBaseUrl = "https://api.yourcompany.com";
});

var app = builder.Build();

app.UsePrism(routes =>
{
    routes.AddRoute("/api/weather", new RoutePaymentConfig { Price = "$0.001", Description = "Weather API access" });
    routes.AddRoute("/api/premium/*", new RoutePaymentConfig { Price = 0.01, Description = "Premium API access" });
});

// Public endpoint — no route configured, passes through untouched.
app.MapGet("/", () => Results.Ok(new { message = "Welcome to Prism API" }));

// Protected endpoint — requires a verified payment; the verified payer address
// is available via HttpContext once the middleware has run.
app.MapGet("/api/weather", (HttpContext context) =>
{
    var payer = context.GetPrismPayer();
    return Results.Ok(new { location = "San Francisco", temperature = 72, payer });
});

app.Run();
```

Route paths are matched ignoring case and trailing slashes, the same way ASP.NET Core resolves endpoints: `/api/weather` also protects `/API/Weather` and `/api/weather/`. Registering two paths that differ only by case or trailing slash throws an `ArgumentException`, both from `AddRoute` and when a routes dictionary containing such a pair is passed to `PrismMiddlewareCore`.

Works identically in an MVC controller — the verified payment is available via the same `HttpContext` extension methods (`GetPrismPayer()`, `GetPrismPayment()`, `GetPrismPaymentInfo()`) regardless of how the route is defined.

### Dependency injection

```csharp
public class PremiumService
{
    private readonly IPrismClient _prismClient;

    public PremiumService(IPrismClient prismClient) => _prismClient = prismClient;

    public Task<PaymentRequiredResponse> GetRequirementsAsync(PaymentRequirementsRequest request) =>
        _prismClient.GetPaymentRequirementsAsync(request);
}
```

## How it works

1. `PrismPaymentMiddleware` checks the incoming request's path against your configured routes.
2. No match → request passes through unprotected.
3. Match, no payment header → the middleware returns `402` with payment requirements fetched from the Prism Gateway.
4. Match, payment header present → the header is size-checked, base64-decoded, and structurally validated (reject malformed payloads before any network call), then verified against the Gateway. Verification failure → `402`.
5. Verification success → your handler runs. Once it responds, the middleware settles the payment with the Gateway. If settlement fails, the response is replaced with a `402`/`500` instead of being sent — your handler's response is never leaked for an unsettled payment.

## Package structure

| Package | Description | Target frameworks |
|---|---|---|
| `Prism.Core` | Wire types, HTTP client, and the framework-agnostic verify/settle logic | net6.0, net7.0, net8.0 |
| `Prism.AspNetCore` | ASP.NET Core middleware + DI extensions. Depends on `Prism.Core` and `Microsoft.AspNetCore.App` | net6.0, net7.0, net8.0 |

## Testing

```bash
cd csharp
dotnet build Prism.SDK.sln
dotnet test Prism.Tests/Prism.Tests.csproj
```

## Documentation

The [Finance District Developer Hub](https://developers.fd.xyz/prism/sdk/overview) has the full SDK guide, API reference, and framework-specific quick starts for TypeScript, Python, and Java — there is no dedicated C# page there yet, so this file is the primary reference for this SDK until one is added.

- [Prism SDK Overview](https://developers.fd.xyz/prism/sdk/overview)
- [x402 Protocol](https://developers.fd.xyz/prism/integrations/x402)
- [API Reference](https://developers.fd.xyz/prism/api-reference/introduction)
- [Local reference docs](../docs/introduction.md)

## Support

For questions or feedback, please open an issue or contact Finance District support.

## License

MIT

---

See the [TypeScript SDK](../typescript/README.md) or [Python SDK](../python/README.md) for equivalent, longer-established implementations of the same protocol.
