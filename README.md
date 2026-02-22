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

### C# / .NET _(coming soon)_

```bash
dotnet add package Prism.AspNetCore
```

### Python / Flask _(coming soon)_

```bash
pip install prism-flask
```

## 📦 Available SDKs

### TypeScript / JavaScript

- **[@financedistrict/prism-x402-sdk-express](./typescript/)** - Express.js middleware ✅
- [@financedistrict/prism-x402-sdk-fastify](./typescript/) - Fastify plugin _(coming soon)_
- [@financedistrict/prism-x402-sdk-nestjs](./typescript/) - NestJS module _(coming soon)_
- [@financedistrict/prism-x402-sdk-nextjs](./typescript/) - Next.js middleware _(coming soon)_

### C# / .NET

- **Prism.AspNetCore** - ASP.NET Core middleware _(coming soon)_
- **Prism.Minimal** - Minimal APIs _(coming soon)_

### Python

- **prism-flask** - Flask middleware _(coming soon)_
- **prism-fastapi** - FastAPI middleware _(coming soon)_
- **prism-django** - Django middleware _(coming soon)_

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

```bash
cd csharp
# Coming soon
```

### Python

```bash
cd python
# Coming soon
```

## 📚 Documentation

- [Introduction](./docs/introduction.md)
- [x402 Protocol](./docs/concepts/x402-protocol.md)
- [Authentication](./docs/concepts/authentication.md)
- [Payment Flow](./docs/concepts/payment-flow.md)
- [Configuration Modes](./docs/concepts/configuration-modes.md)

## 🏗️ Repository Structure

```
Prism-SDK/
├── docs/              # Shared documentation (language-agnostic)
├── typescript/        # TypeScript/JavaScript SDKs
├── csharp/            # C#/.NET SDKs
├── python/            # Python SDKs
├── website/           # Documentation website (Docusaurus)
└── README.md          # This file
```

## 🤝 Contributing

Each SDK follows the language-specific conventions:

- **TypeScript**: ESLint, Prettier, TSDoc
- **C#**: StyleCop, XML documentation
- **Python**: Black, pylint, docstrings

## 📄 License

MIT

## 🔗 Links

- [Prism Gateway Documentation](https://prism-gw.test.1stdigital.tech/health)
- [x402 Protocol Specification](https://github.com/coinbase/x402)

## 💬 Support

For issues and questions, contact Finance District support.
