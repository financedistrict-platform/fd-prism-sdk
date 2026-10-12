# Prism SDK

Multi-language SDK for implementing the x402 payment protocol with Prism Gateway.

## 📦 Installation

### TypeScript / Express.js

```bash
npm install @financedistrict/prism-x402-sdk-express
```

Or configure for GitHub Packages:

```bash
echo "@financedistrict:registry=https://npm.pkg.github.com" >> .npmrc
npm install @financedistrict/prism-x402-sdk-express
```

### C# / .NET

Not yet published to NuGet — build from source (see [csharp/README.md](./csharp/README.md)).

### Python / Flask

```bash
pip install prism-flask
```

### Java / Spring Boot

```xml
<dependency>
  <groupId>org.fdtech.prism</groupId>
  <artifactId>prism-spring-boot-starter</artifactId>
  <version>1.0.0-SNAPSHOT</version>
</dependency>
```

## 📦 Available SDKs

### TypeScript / JavaScript

- **[@financedistrict/prism-x402-sdk-express](./typescript/)** - Express.js middleware ✅
- **[@financedistrict/prism-x402-sdk-fastify](./typescript/)** - Fastify plugin ✅
- **[@financedistrict/prism-x402-sdk-http](./typescript/)** - Framework-agnostic Node HTTP middleware ✅
- **[@financedistrict/prism-x402-sdk-nestjs](./typescript/)** - NestJS module (guard + middleware) ✅
- **[@financedistrict/prism-x402-sdk-nextjs](./typescript/)** - Next.js middleware ✅

### C# / .NET

- **[Prism.Core](./csharp/)** - Core types and HTTP client ✅
- **[Prism.AspNetCore](./csharp/)** - ASP.NET Core middleware ✅

### Python

- **[prism-sdk-core](./python/)** - Core types and HTTP client ✅
- **[prism-flask](./python/)** - Flask middleware ✅
- **[prism-fastapi](./python/)** - FastAPI middleware ✅
- **[prism-django](./python/)** - Django middleware (sync + ASGI) ✅

### Java

- **[prism-sdk-core](./java/)** - Core types and HTTP client ✅
- **[prism-sdk-servlet](./java/)** - Servlet filter ✅
- **[prism-spring-boot-starter](./java/)** - Spring Boot auto-configuration ✅

## 🚀 Quick Start

### TypeScript / Express.js

```typescript
import express from "express";
import { prismPaymentMiddleware } from "@financedistrict/prism-x402-sdk-express";

const app = express();

// Configure Prism middleware
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

// Public endpoint
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Prism API" });
});

// Protected endpoint - requires payment
app.get("/api/weather", (req, res) => {
  res.json({
    location: "San Francisco",
    temperature: 72,
    condition: "Sunny",
  });
});

app.listen(3000);
```

**Installation:**

```bash
cd typescript
npm install
npm run build
```

See [TypeScript SDK documentation](./typescript/README.md) for details.

### C# / .NET

```csharp
// Program.cs
using Prism.AspNetCore.Extensions;
using Prism.Core.Types;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddPrism(options => options.ApiKey = builder.Configuration["Prism:ApiKey"]!);

var app = builder.Build();
app.UsePrism(routes =>
{
    routes.AddRoute("/api/weather", new RoutePaymentConfig { Price = "$0.001", Description = "Weather API access" });
});

app.MapGet("/api/weather", (HttpContext context) =>
    Results.Ok(new { location = "San Francisco", temperature = 72, payer = context.GetPrismPayer() }));

app.Run();
```

See [C# SDK documentation](./csharp/README.md) for details.

### Python / Flask

```python
from flask import Flask, jsonify
from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig
from prism_flask import prism_payment_middleware

app = Flask(__name__)

prism_payment_middleware(
    app,
    PrismMiddlewareConfig(api_key="dev-key-123"),
    {"/api/weather": RoutePaymentConfig(price=0.001, description="Weather API access")},
)

@app.route("/api/weather")
def weather():
    return jsonify({"location": "San Francisco", "temperature": 72})

app.run(port=3000)
```

See [Python SDK documentation](./python/README.md) for details.

### Java / Spring Boot

```properties
# application.properties
prism.api-key=dev-key-123
prism.base-url=https://prism-gw.test.1stdigital.tech

prism.routes[0].path=/api/weather
prism.routes[0].price=1000
prism.routes[0].description=Weather API access
```

The `prism-spring-boot-starter` auto-configures the payment filter from these properties — no code changes needed in your application.

See [Java SDK documentation](./java/README.md) for details.

## 📚 Documentation

Full guides, API reference, and framework-specific quick starts live on the **[Finance District Developer Hub](https://developers.fd.xyz/prism/overview)**:

- [Prism Overview](https://developers.fd.xyz/prism/overview)
- [Quick Start](https://developers.fd.xyz/prism/quickstart)
- [SDK Overview](https://developers.fd.xyz/prism/sdk/overview) - per-framework guides for TypeScript, Python, and Java
- [x402 Protocol](https://developers.fd.xyz/prism/integrations/x402)
- [API Reference](https://developers.fd.xyz/prism/api-reference/introduction)
- [Architecture](https://developers.fd.xyz/prism/architecture/overview)

This repo also has language-agnostic reference docs under [`./docs/`](./docs/introduction.md).

## 🏗️ Repository Structure

```
Prism-SDK/
├── docs/              # Shared documentation (language-agnostic)
├── typescript/        # TypeScript/JavaScript SDKs
├── csharp/            # C#/.NET SDKs
├── python/            # Python SDKs
├── java/              # Java SDKs
├── website/           # Documentation website (Docusaurus)
└── README.md          # This file
```

## 🤝 Contributing

Each SDK follows the language-specific conventions:

- **TypeScript**: ESLint, Prettier, TSDoc
- **C#**: Nullable reference types, XML documentation
- **Python**: Black, pylint, docstrings
- **Java**: Standard Maven conventions, Javadoc

## 📄 License

MIT

## 🔗 Links

- [Prism Gateway Documentation](https://prism-gw.test.1stdigital.tech/health)
- [x402 Protocol Specification](https://github.com/coinbase/x402)

## 💬 Support

For issues and questions, contact Finance District support.
