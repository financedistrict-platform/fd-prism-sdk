# @financedistrict/prism-x402-sdk-http

Prism SDK middleware for **Node.js HTTP** servers. Enable x402 payment requirements on your raw HTTP server routes.

## Installation

```bash
npm install @financedistrict/prism-x402-sdk-http
```

## Quick Start

```javascript
const http = require("http");
const { prismPaymentMiddleware } = require("@financedistrict/prism-x402-sdk-http");

// Create middleware
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

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Apply Prism middleware
  const handled = await paymentMiddleware(req, res);

  if (!handled) {
    // Handle your routes here (payment verified or route not protected)
    const url = require("url").parse(req.url, true);

    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Hello World (free route)");
    } else if (url.pathname === "/api/premium") {
      // This route requires payment (configured above)
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          message: "Premium content!",
          payer: req.payer, // Address of payer (set by middleware)
        })
      );
    } else if (url.pathname === "/weather") {
      // This route requires payment (configured above)
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          temperature: 72,
          condition: "Sunny",
        })
      );
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  }
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```

## TypeScript Usage

```typescript
import * as http from "http";
import {
  prismPaymentMiddleware,
  PrismHttpRequest,
} from "@financedistrict/prism-x402-sdk-http";

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

const server = http.createServer(
  async (req: PrismHttpRequest, res: http.ServerResponse) => {
    const handled = await paymentMiddleware(req, res);

    if (!handled) {
      // Your route handlers
      if (req.path === "/api/premium") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "Premium content!",
            payer: req.payer,
          })
        );
      } else {
        res.writeHead(200);
        res.end("Hello World");
      }
    }
  }
);

server.listen(3000);
```

## How It Works

The middleware returns `true` if it handled the request (sent response), or `false` if you should handle it:

1. **Returns `true`**:

   - Route requires payment and no valid payment provided → Sends 402 response
   - Payment verification failed → Sends error response
   - Middleware handled the request completely

2. **Returns `false`**:
   - Route doesn't require payment → Continue to your handler
   - Payment verified successfully → Continue to your handler (payment info in `req.payment`, `req.payer`)

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
const server = http.createServer(async (req, res) => {
  const handled = await paymentMiddleware(req, res);

  if (!handled && req.path === "/api/premium") {
    // Access payment details
    console.log("Payment:", req.payment); // Payment payload
    console.log("Payer:", req.payer); // Payer's address

    res.writeHead(200);
    res.end(JSON.stringify({ payer: req.payer }));
  }
});
```

## Error Handling

The middleware automatically handles errors:

- **402 Payment Required**: No payment or invalid payment
- **500 Gateway Error**: Prism Gateway issues
- **503 Service Unavailable**: Network connectivity issues

Errors are logged to `console.error()` and appropriate responses are sent.

## Examples

See the [examples](./examples) directory for complete working examples:

- Basic HTTP server
- TypeScript HTTP server
- Advanced routing with payment requirements

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
