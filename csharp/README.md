# Prism SDK for .NET

> **Status:** 🔜 Coming Soon

A .NET SDK for integrating the Prism payment gateway with ASP.NET Core applications.

## Overview

The Prism SDK for .NET will provide middleware for ASP.NET Core to protect routes with micropayments using the x402 protocol.

## Planned Features

- ✅ ASP.NET Core middleware
- ✅ Support for .NET 6.0, 7.0, and 8.0
- ✅ On-demand payment requirements generation
- ✅ Cloud-hosted configuration support
- ✅ File-based configuration support
- ✅ Type-safe API with full IntelliSense
- ✅ Async/await throughout
- ✅ Dependency injection support
- ✅ Built-in logging with ILogger
- ✅ Comprehensive XML documentation

## Planned Architecture

```
Prism.SDK/
├── Prism.Core/                   # Core types and client
│   ├── Client/
│   │   └── PrismClient.cs
│   ├── Models/
│   │   ├── PaymentRequirements.cs
│   │   ├── PaymentPayload.cs
│   │   └── RoutesConfig.cs
│   └── Configuration/
│       └── PrismMiddlewareConfig.cs
├── Prism.AspNetCore/             # ASP.NET Core middleware
│   ├── Middleware/
│   │   └── PrismPaymentMiddleware.cs
│   └── Extensions/
│       └── PrismServiceCollectionExtensions.cs
└── Prism.Tests/                  # Unit and integration tests
    ├── Middleware/
    └── Client/
```

## Planned Usage

### Installation

```bash
dotnet add package Prism.AspNetCore
```

### Configuration

```csharp
// Program.cs
using Prism.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Add Prism services
builder.Services.AddPrism(options =>
{
    options.ApiKey = builder.Configuration["Prism:ApiKey"];
    options.UseSandbox = builder.Environment.IsDevelopment();
});

var app = builder.Build();

// Use Prism middleware
app.UsePrism(routes =>
{
    routes.AddRoute("/api/premium", new RouteConfig
    {
        Price = 0.01m,
        Description = "Premium API access"
    });

    routes.AddRoute("/api/data/*", new RouteConfig
    {
        Price = 0.005m,
        Description = "Data API access"
    });
});

app.MapGet("/api/premium", (HttpContext context) =>
{
    var payment = context.Items["Prism.Payment"] as PaymentPayload;
    return Results.Ok(new { Message = "Premium content", Payment = payment });
});

app.Run();
```

### Dependency Injection

```csharp
public class PremiumService
{
    private readonly IPrismClient _prismClient;
    private readonly ILogger<PremiumService> _logger;

    public PremiumService(IPrismClient prismClient, ILogger<PremiumService> logger)
    {
        _prismClient = prismClient;
        _logger = logger;
    }

    public async Task<PaymentRequirements> GetRequirementsAsync(string route)
    {
        _logger.LogInformation("Fetching payment requirements for {Route}", route);
        return await _prismClient.GetPaymentRequirementsAsync(route, 0.01m, "Premium access");
    }
}
```

### Minimal API Example

```csharp
var app = WebApplication.CreateBuilder(args).Build();

app.UsePrism(routes =>
{
    routes.AddRoute("/api/weather", new RouteConfig
    {
        Price = 0.01m,
        Description = "Weather API"
    });
});

app.MapGet("/api/weather", () =>
{
    return new WeatherForecast
    {
        Date = DateTime.Now,
        TemperatureC = Random.Shared.Next(-20, 55),
        Summary = "Sunny"
    };
});

app.Run();
```

### Controller Example

```csharp
[ApiController]
[Route("api/[controller]")]
public class DataController : ControllerBase
{
    [HttpGet]
    public IActionResult GetData()
    {
        // Payment info available in HttpContext.Items
        var payment = HttpContext.Items["Prism.Payment"] as PaymentPayload;

        return Ok(new
        {
            Data = "Protected data",
            PaymentNonce = payment?.Nonce
        });
    }
}
```

## Planned Package Structure

### Prism.Core

Core types and HTTP client for Prism Gateway API.

**NuGet Package:** `Prism.Core`
**Target Frameworks:** .NET 6.0, .NET 7.0, .NET 8.0

### Prism.AspNetCore

ASP.NET Core middleware and extensions.

**NuGet Package:** `Prism.AspNetCore`
**Target Frameworks:** .NET 6.0, .NET 7.0, .NET 8.0
**Dependencies:**

- Prism.Core
- Microsoft.AspNetCore.Http.Abstractions

## Timeline

- **Q1 2026**: Initial alpha release with on-demand mode
- **Q2 2026**: Beta release with cloud/file configuration modes
- **Q3 2026**: Production-ready v1.0 release
- **Q4 2026**: Additional features (caching, metrics, etc.)

## Documentation

Once released, full documentation will be available at:

- [SDK Documentation](../../docs/introduction.md)
- [x402 Protocol](../../docs/concepts/x402-protocol.md)
- [Authentication](../../docs/concepts/authentication.md)
- [Payment Flow](../../docs/concepts/payment-flow.md)
- [Configuration Modes](../../docs/concepts/configuration-modes.md)

## Support

For questions or feedback, please contact:

- Email: support@1stdigital.tech
- Documentation: https://docs.prism.1stdigital.tech

## Contributing

Contributions will be welcome once the initial release is available. Please stay tuned!

## License

TBD

---

**Current Status:** Planning phase. TypeScript SDK is available now as a reference implementation.

See the [TypeScript SDK](../typescript/README.md) for a working implementation that you can use today.
