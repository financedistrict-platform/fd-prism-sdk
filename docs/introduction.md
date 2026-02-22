# Introduction to Prism SDK

Prism SDK provides a seamless way to integrate the x402 payment protocol into your web applications across multiple programming languages and frameworks.

## What is Prism?

Prism is a payment gateway that implements the x402 HTTP payment protocol, enabling micropayments for digital resources using cryptocurrency on various blockchain networks.

## What is x402?

x402 is an open standard payment protocol built on top of HTTP. It uses the `402 Payment Required` status code to enable automatic, programmatic payments for web resources.

Learn more: [x402 Protocol Specification](https://github.com/coinbase/x402)

## Key Features

- 🔐 **API Key Authentication** - Simple authentication with Prism Gateway
- 💰 **Multiple Blockchains** - Support for various blockchain networks
- 🎯 **Route-based Pricing** - Configure different prices for different endpoints
- 🧪 **Sandbox Mode** - Test environment for development
- 🚀 **Easy Integration** - One-line middleware setup
- 🌍 **Multi-language** - TypeScript, C#, Python support

## How It Works

1. **Client Request**: User makes a request to a protected resource
2. **402 Response**: Server returns `402 Payment Required` with payment options
3. **Payment Submission**: Client includes `X-PAYMENT` header with payment proof
4. **Verification**: Server verifies the payment with Prism Gateway
5. **Access Granted**: Request proceeds to the protected resource
6. **Settlement**: Payment is settled on-chain

## Quick Example

### TypeScript / Express.js

```typescript
import express from "express";
import { prismPaymentMiddleware } from "@financedistrict/prism-x402-sdk-express";

const app = express();

// Configure Prism payment middleware
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

// Public endpoint (no payment required)
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Prism API" });
});

// Protected endpoint - requires payment
app.get("/api/weather", (req, res) => {
  const payment = res.locals.payment;

  res.json({
    location: "San Francisco",
    temperature: 72,
    condition: "Sunny",
  });
});

app.listen(3000);
```

### C# / ASP.NET Core

```csharp
// Coming soon
```

### Python / Flask

```python
# Coming soon
```

## Next Steps

- [Authentication Guide](./concepts/authentication.md)
- [Payment Flow](./concepts/payment-flow.md)
- [Configuration Modes](./concepts/configuration-modes.md)
- Choose your language:
  - [TypeScript SDK](../typescript/README.md)
  - [C# SDK](../csharp/README.md) _(coming soon)_
  - [Python SDK](../python/README.md) _(coming soon)_
