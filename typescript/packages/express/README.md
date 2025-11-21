# @1stdigital/prism-express

Prism SDK middleware for **Express.js**. Enable x402 payment requirements on your Express routes with a simple middleware.

## Installation

```bash
npm install @1stdigital/prism-express
```

## Quick Start

```javascript
const express = require("express");
const { prismPaymentMiddleware } = require("@1stdigital/prism-express");

const app = express();

// Configure Prism middleware
const paymentMiddleware = prismPaymentMiddleware(
  {
    apiKey: "your-api-key",
    gatewayUrl: "https://gateway.prism.1stdigital.com",
  },
  {
    "/api/premium": {
      price: 0.01,
      description: "Premium API access",
    },
    "/weather": {
      price: "$0.001",
      description: "Weather data",
    },
  }
);

// Apply middleware globally or to specific routes
app.use(paymentMiddleware);

// Your routes
app.get("/", (req, res) => {
  res.send("Hello World (free route)");
});

app.get("/api/premium", (req, res) => {
  // This route requires payment (configured above)
  res.json({
    message: "Premium content!",
    payer: req.payer, // Address of payer (set by middleware)
  });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```

## TypeScript Usage

```typescript
import express, { Request, Response } from "express";
import { prismPaymentMiddleware } from "@1stdigital/prism-express";

const app = express();

const paymentMiddleware = prismPaymentMiddleware(
  {
    apiKey: process.env.PRISM_API_KEY!,
    gatewayUrl: "https://gateway.prism.1stdigital.com",
  },
  {
    "/api/premium": {
      price: 0.01,
      description: "Premium API access",
    },
  }
);

app.use(paymentMiddleware);

app.get("/api/premium", (req: Request, res: Response) => {
  res.json({
    message: "Premium content!",
    payer: (req as any).payer,
  });
});

app.listen(3000);
```

## How It Works

The middleware intercepts requests and checks if they require payment:

1. **No payment required**: Request passes through to your route handler
2. **Payment required, no payment provided**: Returns 402 with payment requirements
3. **Payment provided**: Verifies payment and allows access (payment info available in `req.payment`, `req.payer`)

## Configuration

### Middleware Config

```typescript
{
  apiKey: string;        // Your Prism API key
  gatewayUrl?: string;   // Prism Gateway URL (optional)
  debug?: boolean;       // Enable debug logging (optional)
}
```

**Debug Mode:**

Enable detailed logging to see what's being sent to the gateway:

```javascript
const middleware = prismPaymentMiddleware(
  {
    apiKey: "your-key",
    debug: true, // Logs all requests/responses
  },
  routes
);

// Debug output will show:
// - Parsed prices (e.g., 0.001 from "$0.001")
// - Payment requirements requests/responses
// - Payment verification details
// - Settlement results
```

### Routes Config

```typescript
{
  '/route/path': {
    price: 0.01,                    // Price in ETH or '$0.01' format
    description: 'Route description',
    resource?: 'custom-url',        // Optional resource URL
    mimeType?: 'application/json'   // Optional MIME type
  }
}
```

### Wildcard Routes

```typescript
{
  '/api/*': {  // Matches /api/anything
    price: 0.001,
    description: 'API access'
  }
}
```

## Accessing Payment Info

After successful payment verification, payment information is available on the request:

```javascript
app.get("/api/premium", (req, res) => {
  // Access payment details
  console.log("Payment:", req.payment); // Payment payload
  console.log("Payer:", req.payer); // Payer's address

  res.json({ payer: req.payer });
});
```

## Route-Specific Middleware

You can also apply the middleware to specific routes only:

```javascript
// Apply to specific routes
app.get('/api/premium', paymentMiddleware, (req, res) => {
  res.json({ message: 'Premium content' });
});

app.get('/api/data', paymentMiddleware, (req, res) => {
  res.json({ data: [...] });
});

// Free routes don't need the middleware
app.get('/public', (req, res) => {
  res.json({ message: 'Free content' });
});
```

## Error Handling

The middleware automatically handles errors:

- **402 Payment Required**: No payment or invalid payment
- **500 Gateway Error**: Prism Gateway issues
- **503 Service Unavailable**: Network connectivity issues

Errors are logged to `console.error()` and appropriate responses are sent.

## Examples

### Basic Express Server

```javascript
const express = require("express");
const { prismPaymentMiddleware } = require("@1stdigital/prism-express");

const app = express();

const paymentMiddleware = prismPaymentMiddleware(
  {
    apiKey: process.env.PRISM_API_KEY,
    // debug: true  // Uncomment to see detailed logs
  },
  {
    "/api/premium": { price: 0.01, description: "Premium API" },
    "/api/data/*": { price: 0.005, description: "Data API" },
  }
);

app.use(paymentMiddleware);

app.get("/", (req, res) => res.send("Home"));
app.get("/api/premium", (req, res) => res.json({ premium: true }));
app.get("/api/data/users", (req, res) => res.json({ users: [] }));

app.listen(3000);
```

### Multiple Price Formats

```javascript
const routes = {
  "/cheap": { price: 0.001 }, // Number
  "/medium": { price: "0.01" }, // String
  "/expensive": { price: "$0.1" }, // String with currency
  "/euro": { price: "€0.05" }, // Different currency
};
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm test

# Watch mode
npm run dev
```

## License

MIT
