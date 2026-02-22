# Prism Express Middleware

Express.js middleware for implementing x402 payment protocol with Prism Gateway.

## Installation

```bash
npm install @financedistrict/prism-x402-sdk-express
```

## Quick Start

```typescript
import express from "express";
import { prismPaymentMiddleware } from "@financedistrict/prism-x402-sdk-express";

const app = express();

// Configure payment middleware
app.use(
  prismPaymentMiddleware(
    {
      apiKey: "your-api-key",
    },
    {
      "/api/premium": {
        price: 0.01,
        description: "Premium API access",
        mimeType: "application/json",
      },
      "/weather": {
        price: "$0.001",
        description: "Weather data",
      },
    },
  ),
);

// Your protected routes
app.get("/api/premium", (req, res) => {
  res.json({ message: "Premium content" });
});

app.get("/weather", (req, res) => {
  res.json({ temperature: 72, condition: "sunny" });
});

app.listen(3000);
```

## Configuration

### Middleware Options

```typescript
interface PrismMiddlewareConfig {
  // Required: API Key for Prism Gateway authentication
  apiKey: string;

  // Optional: Gateway URL (defaults to test environment)
  // Test: https://prism-gw.test.1stdigital.tech (default)
  // Production: https://prism-api.1stdigital.tech
  baseUrl?: string;
}
```

### Route Configuration

```typescript
interface RoutePaymentConfig {
  // Price to charge (number or string like "$0.01")
  price: number | string;

  // Optional: Description of the resource
  description?: string;

  // Optional: MIME type (default: 'application/json')
  mimeType?: string;

  // Optional: Max timeout in seconds (default: 60)
  maxTimeoutSeconds?: number;

  // Optional: Custom resource URL (default: request URL)
  resource?: string;
}
```

## Implementation Modes

The middleware currently uses **on-demand mode** internally, which calls the Prism Gateway API to generate payment requirements dynamically.

**Future modes** (not yet exposed in public API):

- **Cloud mode**: Load payment configuration from cloud-hosted JSON
- **File mode**: Load payment configuration from local JSON file

These will be added in future releases.

## How It Works

1. **Request without payment**: Client makes request to protected route
2. **402 Response**: Middleware returns 402 Payment Required with payment options
3. **Payment submission**: Client includes `X-PAYMENT` header with payment proof
4. **Verification**: Middleware verifies payment with Prism Gateway
5. **Access granted**: Request proceeds to route handler
6. **Settlement**: Payment is settled after successful response

## Examples

### Wildcard Routes

```typescript
app.use(
  prismPaymentMiddleware(config, {
    "/api/premium/*": {
      price: 0.05,
      description: "Premium API endpoints",
    },
  }),
);
```

### Multiple Price Points

```typescript
app.use(
  prismPaymentMiddleware(config, {
    "/api/basic": {
      price: 0.001,
      description: "Basic API access",
    },
    "/api/premium": {
      price: 0.01,
      description: "Premium API access",
    },
    "/api/enterprise": {
      price: 0.1,
      description: "Enterprise API access",
    },
  }),
);
```

### Accessing Payment Info

Payment information is available in route handlers via `res.locals.payment`:

```typescript
app.get("/api/premium", (req, res) => {
  const payment = res.locals.payment;
  console.log("Payment scheme:", payment.scheme);
  console.log("Payment network:", payment.network);

  res.json({ message: "Premium content" });
});
```

## Environments

- **Test (default)**: `https://prism-gw.test.1stdigital.tech`
- **Production**: `https://prism-api.1stdigital.tech`

The middleware defaults to the test environment. For production, specify the `baseUrl`:

```typescript
{
  apiKey: "your-api-key",
  baseUrl: "https://prism-api.1stdigital.tech"
}
```

## API Endpoints Used

The middleware interacts with these Prism Gateway endpoints:

- `GET /api/v1/auth-info` - Verify API key and get authentication info
- `POST /api/v1/payment/requirements` - Get payment requirements for a resource
- `POST /api/v1/payment/verify` - Verify payment (coming soon)
- `POST /api/v1/payment/settle` - Settle payment (coming soon)

## Development Status

### ✅ Implemented

- On-demand mode (Option 1)
- Payment requirements generation
- Route matching and protection
- 402 Payment Required responses

### 🚧 Coming Soon

- Payment verification endpoint integration
- Payment settlement endpoint integration
- Cloud hosted configuration (Option 2)
- Downloaded file configuration (Option 3)
- Decorator support (Phase 2)

## License

MIT

## Support

For issues and questions, contact Finance District support.
