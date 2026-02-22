# Prism SDK Documentation

Welcome to the Prism SDK documentation. This documentation is shared across all SDK implementations (TypeScript, C#, Python).

## Quick Links

- [Introduction](./introduction.md) - Start here for an overview
- [TypeScript SDK](../typescript/README.md) - Available now ✅
- [C# SDK](../csharp/README.md) - Coming soon 🔜
- [Python SDK](../python/README.md) - Coming soon 🔜

## Core Concepts

Learn about the fundamental concepts behind Prism SDK:

1. **[x402 Protocol](./concepts/x402-protocol.md)**
   - Understanding HTTP 402 Payment Required
   - Payment requirement format
   - Payment payload structure
   - Network and asset support

2. **[Authentication](./concepts/authentication.md)**
   - API key management
   - Sandbox vs Production environments
   - Security best practices
   - Environment configuration

3. **[Payment Flow](./concepts/payment-flow.md)**
   - Complete payment lifecycle
   - Client-server interaction diagram
   - 13-step payment process
   - Gateway integration

4. **[Configuration Modes](./concepts/configuration-modes.md)**
   - On-demand mode (current)
   - Cloud-hosted configuration (coming soon)
   - File-based configuration (coming soon)
   - Choosing the right mode

## Guides

Practical guides for implementing and deploying Prism SDK:

- **[Testing Guide](./guides/testing.md)**
  - Sandbox environment setup
  - Manual testing with curl/PowerShell
  - Automated testing strategies
  - Payment flow testing
  - Common issues and solutions

- **[Production Deployment](./guides/production-deployment.md)**
  - Pre-deployment checklist
  - Environment configuration
  - Security best practices
  - Performance optimization
  - Monitoring and logging
  - Disaster recovery

## SDK Implementations

### TypeScript SDK (Available Now)

The TypeScript SDK is fully functional and production-ready.

**Key Features:**

- Express.js middleware
- On-demand payment requirements
- Route matching (exact and wildcard)
- Type-safe API
- Comprehensive examples

**Links:**

- [TypeScript SDK Documentation](../typescript/README.md)
- [Installation Guide](../typescript/README.md#installation)
- [Quick Start](../typescript/README.md#quick-start)
- [API Reference](../typescript/README.md#api-reference)
- [Examples](../typescript/examples/)

### C# SDK (Coming Soon)

The C# SDK will provide ASP.NET Core middleware.

**Planned Features:**

- ASP.NET Core middleware
- .NET 6.0, 7.0, 8.0 support
- Dependency injection
- Built-in logging
- XML documentation

**Links:**

- [C# SDK Documentation](../csharp/README.md)
- [Planned Architecture](../csharp/README.md#planned-architecture)
- [Usage Examples](../csharp/README.md#planned-usage)

### Python SDK (Coming Soon)

The Python SDK will support Flask and FastAPI.

**Planned Features:**

- Flask middleware
- FastAPI middleware
- Python 3.8+ support
- Async/await support
- Type hints

**Links:**

- [Python SDK Documentation](../python/README.md)
- [Planned Architecture](../python/README.md#planned-architecture)
- [Usage Examples](../python/README.md#planned-usage)

## Getting Started

### 1. Choose Your SDK

Pick the SDK that matches your technology stack:

- **TypeScript/Node.js** → [TypeScript SDK](../typescript/README.md)
- **.NET/C#** → [C# SDK](../csharp/README.md) (coming soon)
- **Python** → [Python SDK](../python/README.md) (coming soon)

### 2. Install the SDK

Follow the installation instructions for your chosen SDK:

**TypeScript:**

```bash
npm install @financedistrict/prism-x402-sdk-express
```

**C# (coming soon):**

```bash
dotnet add package Prism.AspNetCore
```

**Python (coming soon):**

```bash
pip install prism-flask  # or prism-fastapi
```

### 3. Get Your API Key

1. Sign up at https://prism.1stdigital.tech
2. Create a new project
3. Generate an API key
4. Use `dev-key-123` for sandbox testing

### 4. Implement Middleware

Add the Prism middleware to protect your routes:

**TypeScript:**

```typescript
import { prismPaymentMiddleware } from "@financedistrict/prism-x402-sdk-express";

app.use(
  prismPaymentMiddleware(
    {
      apiKey: "dev-key-123",
    },
    {
      "/api/weather": {
        price: 0.001,
        description: "Weather API access",
      },
      "/api/premium/*": {
        price: 0.01,
        description: "Premium API endpoints",
      },
    },
  ),
);
```

**C# (coming soon):**

```csharp
app.UsePrism(routes =>
{
    routes.AddRoute("/api/premium", new RouteConfig
    {
        Price = 0.01m,
        Description = "Premium access"
    });
});
```

**Python (coming soon):**

```python
app.add_middleware(
    PrismMiddleware,
    api_key='your-api-key',
    use_sandbox=True,
    routes={'/api/premium': {'price': 0.01, 'description': 'Premium access'}}
)
```

### 5. Test Your Integration

See the [Testing Guide](./guides/testing.md) for detailed testing instructions.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Application                       │
│  (Makes requests with/without X-PAYMENT header)                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Your API Server                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Prism SDK Middleware                     │  │
│  │  • Intercepts requests                                    │  │
│  │  • Checks for protected routes                            │  │
│  │  • Validates X-PAYMENT header                             │  │
│  │  • Returns 402 or allows access                           │  │
│  └─────────────────────────┬────────────────────────────────┘  │
│                             │                                    │
│  ┌─────────────────────────▼────────────────────────────────┐  │
│  │              Your Route Handlers                          │  │
│  │  • Premium content                                        │  │
│  │  • Protected APIs                                         │  │
│  │  • Business logic                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Prism Gateway API                             │
│  • Generate payment requirements                                 │
│  • Verify payment signatures                                     │
│  • Settle payments                                               │
│  • Manage API keys                                               │
└─────────────────────────────────────────────────────────────────┘
```

## Payment Flow Summary

1. **Client requests protected route** without payment
2. **Middleware intercepts** and checks route protection
3. **Gateway API called** to generate payment requirements
4. **402 response returned** with payment details
5. **Client generates payment** (signature, receipt, nonce)
6. **Client retries request** with X-PAYMENT header
7. **Middleware validates** payment format
8. **Gateway verifies** payment signature and receipt
9. **Payment settled** by Gateway
10. **Access granted** to protected resource

See the [Payment Flow](./concepts/payment-flow.md) documentation for complete details.

## Common Use Cases

### Micropayments for APIs

Charge small amounts for API access:

```typescript
app.use(
  prismPaymentMiddleware(
    {
      apiKey: "dev-key-123",
    },
    {
      "/api/weather": {
        price: 0.001,
        description: "Weather API access",
      },
    },
  ),
);

app.get("/api/weather", (req, res) => {
  res.json({
    location: "San Francisco",
    temperature: 72,
    condition: "Sunny",
  });
});
```

### Premium Content Access

Protect premium routes with wildcard patterns:

```typescript
app.use(
  prismPaymentMiddleware(
    {
      apiKey: "dev-key-123",
    },
    {
      "/api/premium/*": {
        price: 0.01,
        description: "Premium API endpoints",
      },
    },
  ),
);

app.get("/api/premium/data", (req, res) => {
  const payment = res.locals.payment;
  res.json({
    premium: true,
    data: "This is premium content",
    paymentNonce: payment?.nonce,
  });
});
```

## Support & Resources

### Documentation

- [Introduction](./introduction.md)
- [Concepts](./concepts/)
- [Guides](./guides/)

### Community

- GitHub: https://github.com/1stdigital/prism-sdk
- Discord: https://discord.gg/prism-sdk
- Email: support@1stdigital.tech

### Links

- Website: https://prism.1stdigital.tech
- API Docs: https://docs.prism.1stdigital.tech
- Status Page: https://status.prism.1stdigital.tech

## Contributing

We welcome contributions to improve the SDK and documentation!

### Reporting Issues

- Use GitHub Issues for bug reports
- Provide minimal reproduction steps
- Include SDK version and environment details

### Feature Requests

- Discuss in GitHub Discussions first
- Explain use case and benefits
- Consider cross-SDK compatibility

### Documentation

- Fix typos and clarify explanations
- Add examples and use cases
- Translate to other languages

## License

TBD

---

**Last Updated:** January 2025
**SDK Versions:** TypeScript v1.0.0 (released), C# v1.0.0 (planned), Python v1.0.0 (planned)
