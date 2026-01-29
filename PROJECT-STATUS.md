# Prism SDK - Project Status

**Last Updated:** January 2025

## 📊 Project Overview

This is a multi-language SDK monorepo for integrating the Prism Payment Gateway with web applications using the x402 protocol standard (HTTP 402 Payment Required).

## 🗂️ Repository Structure

```
SDK/
├── typescript/          ✅ Complete and functional
│   ├── src/            # TypeScript source code
│   ├── dist/           # Compiled JavaScript
│   ├── examples/       # Usage examples
│   └── README.md       # TypeScript SDK documentation
│
├── csharp/             🔜 Coming Soon (Q1 2026)
│   └── README.md       # Planned C# SDK overview
│
├── python/             🔜 Coming Soon (Q1 2026)
│   └── README.md       # Planned Python SDK overview
│
├── docs/               📚 Shared documentation
│   ├── README.md       # Documentation index
│   ├── introduction.md # SDK introduction
│   ├── concepts/       # Core concepts
│   │   ├── x402-protocol.md
│   │   ├── authentication.md
│   │   ├── payment-flow.md
│   │   └── configuration-modes.md
│   └── guides/         # How-to guides
│       ├── testing.md
│       └── production-deployment.md
│
├── website/            🔜 Coming Soon (Q2 2026)
│   └── (Docusaurus documentation site)
│
└── README.md           # This file - main project overview
```

## ✅ Completed Features

### TypeScript SDK

- ✅ Express.js middleware
- ✅ PrismClient for Gateway API
- ✅ On-demand payment requirements generation
- ✅ Route matching (exact paths and wildcards)
- ✅ X-PAYMENT header parsing and validation
- ✅ 402 Payment Required responses
- ✅ Type-safe API with full TypeScript support
- ✅ Comprehensive examples
- ✅ API key authentication
- ✅ Sandbox and production environments

### Documentation

- ✅ Introduction and overview
- ✅ x402 protocol specification
- ✅ Authentication guide
- ✅ Complete payment flow documentation
- ✅ Configuration modes explanation
- ✅ Testing guide with sandbox examples
- ✅ Production deployment guide

## 🚧 In Progress

### Documentation Website

- 🔄 Planning Docusaurus setup
- 🔄 Multi-language code examples
- 🔄 API reference generation

## 📋 Planned Features

### C# SDK (Q1 2026)

- ASP.NET Core middleware
- .NET 6.0, 7.0, 8.0 support
- Dependency injection
- Built-in ILogger support
- NuGet packages

### Python SDK (Q1 2026)

- Flask middleware
- FastAPI middleware
- Python 3.8+ support
- Async/await support
- PyPI packages

### Configuration Modes (Q4 2025 - Q1 2026)

- Cloud-hosted configuration
- File-based configuration
- Hybrid mode with fallback chains

### Advanced Features (Q2-Q4 2026)

- Payment caching
- Metrics and monitoring
- Rate limiting
- Circuit breakers
- Retry logic

## 🎯 Current Status

| Component      | Status              | Version |
| -------------- | ------------------- | ------- |
| TypeScript SDK | ✅ Production Ready | 1.0.0   |
| C# SDK         | 🔜 Planned          | -       |
| Python SDK     | 🔜 Planned          | -       |
| Documentation  | ✅ Complete         | -       |
| Website        | 🔜 Planned          | -       |

## 🚀 Quick Start

### TypeScript (Available Now)

```bash
# Install
cd typescript
npm install

# Build
npm run build

# Test
npm test

# Run example
npm run example
```

### Testing Against Prism Gateway

```powershell
# Health check
Invoke-RestMethod -Uri "https://prism-gw.test.1stdigital.tech/api/health" `
  -Method GET

# Get auth info
$headers = @{ "X-API-Key" = "dev-key-123" }
Invoke-RestMethod -Uri "https://prism-gw.test.1stdigital.tech/api/auth-info" `
  -Method GET `
  -Headers $headers
```

## 📚 Documentation

- **Main Documentation:** [docs/README.md](./docs/README.md)
- **TypeScript SDK:** [typescript/README.md](./typescript/README.md)
- **C# SDK:** [csharp/README.md](./csharp/README.md) _(planned)_
- **Python SDK:** [python/README.md](./python/README.md) _(planned)_

### Key Concepts

- [x402 Protocol](./docs/concepts/x402-protocol.md) - HTTP 402 Payment Required standard
- [Authentication](./docs/concepts/authentication.md) - API key management
- [Payment Flow](./docs/concepts/payment-flow.md) - Complete payment lifecycle
- [Configuration Modes](./docs/concepts/configuration-modes.md) - On-demand, cloud, and file modes

### Guides

- [Testing Guide](./docs/guides/testing.md) - Sandbox testing and automated tests
- [Production Deployment](./docs/guides/production-deployment.md) - Security and best practices

## 🏗️ Architecture

```
┌──────────────────┐
│  Client App      │
│  (Browser/Mobile)│
└────────┬─────────┘
         │
         │ HTTP Request
         │ X-PAYMENT header (optional)
         ▼
┌─────────────────────────────────────────┐
│  Your API Server                        │
│  ┌───────────────────────────────────┐  │
│  │  Prism SDK Middleware             │  │
│  │  • Intercept requests             │  │
│  │  • Check route protection         │  │
│  │  • Validate payments              │  │
│  │  • Return 402 or grant access     │  │
│  └─────────────┬─────────────────────┘  │
│                │                         │
│  ┌─────────────▼─────────────────────┐  │
│  │  Your Route Handlers              │  │
│  │  • Business logic                 │  │
│  │  • Protected content              │  │
│  └───────────────────────────────────┘  │
└────────────┬────────────────────────────┘
             │
             │ Gateway API calls
             ▼
┌──────────────────────────────────────────┐
│  Prism Gateway API                       │
│  • Generate payment requirements         │
│  • Verify payment signatures             │
│  • Settle payments                       │
│  • Manage API keys                       │
└──────────────────────────────────────────┘
```

## 🧪 Testing

### Sandbox Environment

- **Gateway URL:** https://prism-gw.test.1stdigital.tech
- **API Key:** `dev-key-123`
- **Test Networks:** base-sepolia, ethereum-sepolia

### Production Environment

- **Gateway URL:** https://prism-api.1stdigital.tech
- **API Key:** Your production key
- **Mainnet Networks:** base, ethereum

## 📦 NPM Packages (TypeScript)

Published packages:

- `prism-express-sdk` - Express.js middleware

Planned packages:

- `@prism-sdk/core` - Core client library
- `@prism-sdk/express` - Express middleware
- `@prism-sdk/fastify` - Fastify plugin
- `@prism-sdk/koa` - Koa middleware

## 🌐 NuGet Packages (C# - Planned)

Planned packages:

- `Prism.Core` - Core client library
- `Prism.AspNetCore` - ASP.NET Core middleware

## 🐍 PyPI Packages (Python - Planned)

Planned packages:

- `prism-sdk` - Core client library
- `prism-flask` - Flask middleware
- `prism-fastapi` - FastAPI middleware

## 🛠️ Development

### Prerequisites

- Node.js 18+ (TypeScript SDK)
- .NET 8.0+ (C# SDK, when available)
- Python 3.8+ (Python SDK, when available)

### Building TypeScript SDK

```bash
cd typescript
npm install
npm run build
npm test
```

### Code Quality

```bash
# TypeScript
npm run lint
npm run format
npm test

# C# (planned)
dotnet format
dotnet test

# Python (planned)
flake8 .
black .
pytest
```

## 📖 API Reference

### TypeScript

```typescript
import express from "express";
import { prismPaymentMiddleware } from "prism-express-sdk";

const app = express();

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
    }
  )
);

app.get("/api/weather", (req, res) => {
  res.json({
    location: "San Francisco",
    temperature: 72,
    condition: "Sunny",
  });
});
```

### C# (Planned)

```csharp
app.UsePrism(routes =>
{
    routes.AddRoute("/api/premium", new RouteConfig
    {
        Price = 0.01m,
        Description = "Premium content"
    });
});
```

### Python (Planned)

```python
app.add_middleware(
    PrismMiddleware,
    api_key='your-api-key',
    use_sandbox=True,
    routes={'/api/premium': {'price': 0.01, 'description': 'Premium content'}}
)
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Read the documentation
2. Follow coding standards
3. Write tests for new features
4. Update documentation
5. Submit a pull request

## 📄 License

TBD

## 🔗 Links

- **Website:** https://prism.1stdigital.tech
- **Documentation:** https://docs.prism.1stdigital.tech
- **Status Page:** https://status.prism.1stdigital.tech
- **GitHub:** https://github.com/1stdigital/prism-sdk
- **Support:** support@1stdigital.tech

## 📈 Roadmap

### 2025 Q4

- ✅ TypeScript SDK v1.0
- ✅ Core documentation
- 🔄 Cloud configuration mode
- 🔄 File configuration mode

### 2026 Q1

- C# SDK alpha
- Python SDK alpha
- Enhanced testing tools
- CI/CD pipeline

### 2026 Q2

- C# SDK v1.0
- Python SDK v1.0
- Documentation website
- API reference generation

### 2026 Q3

- Advanced caching
- Metrics and monitoring
- Performance optimizations
- Additional framework support

### 2026 Q4

- Enterprise features
- Advanced configuration
- Multi-region support
- Enhanced security features

---

**For detailed information, see the [documentation](./docs/README.md).**
