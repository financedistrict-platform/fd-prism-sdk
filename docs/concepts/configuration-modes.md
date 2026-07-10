# Configuration Modes

Prism SDK supports different modes for generating payment requirements, each suited for different use cases.

## Overview

| Mode          | When to Use                             | Implementation Status |
| ------------- | --------------------------------------- | --------------------- |
| **On-Demand** | Dynamic pricing, real-time updates      | âœ… Implemented        |
| **Cloud**     | Static config, CDN distribution         | ðŸ”œ Coming Soon        |
| **File**      | Offline deployments, air-gapped systems | ðŸ”œ Coming Soon        |

## Mode 1: On-Demand (Current)

**How it works:**

- SDK calls Prism Gateway API for each protected route
- Gateway generates payment requirements dynamically
- Fresh, real-time configuration

**Use cases:**

- Dynamic pricing
- Real-time network/asset availability
- Frequently changing configurations

**Example:**

```typescript
import express from "express";
import { prismPaymentMiddleware } from "@financedistrict/prism-x402-sdk-express";

const app = express();

app.use(
  prismPaymentMiddleware(
    {
      apiKey: "dev-key-123",
      // Mode is internally set to 'on-demand'
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

app.get("/api/weather", (req, res) => {
  res.json({
    location: "San Francisco",
    temperature: 72,
    condition: "Sunny",
  });
});
```

**Flow:**

```
Request â†’ SDK â†’ Prism Gateway API â†’ Payment Requirements â†’ 402 Response
```

**Pros:**

- âœ… Always up-to-date
- âœ… Real-time asset/network availability
- âœ… Dynamic pricing support
- âœ… No local configuration needed

**Cons:**

- âš ï¸ Requires Gateway API call for each 402 response
- âš ï¸ Slight latency overhead (~50-100ms)
- âš ï¸ Depends on Gateway availability

## Mode 2: Cloud Hosted Configuration (Coming Soon)

**How it works:**

- SDK loads static configuration from cloud URL
- Configuration cached locally
- SDK generates 402 responses without Gateway calls

**Use cases:**

- High-traffic applications
- Reduced API call costs
- Static pricing models
- CDN distribution

**Example:**

```typescript
// Future implementation
app.use(
  prismPaymentMiddleware(
    {
      apiKey: "dev-key-123",
      mode: "cloud",
      cloudConfigUrl: "https://config.prism.1stdigital.tech/client-123.json",
    },
    routes,
  ),
);
```

**Configuration format:**

```json
{
  "x402Version": 1,
  "updatedAt": "2025-11-05T10:00:00Z",
  "accepted": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "payTo": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "maxTimeoutSeconds": 300,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ]
}
```

**Flow:**

```
Startup â†’ Load Config from Cloud â†’ Cache Locally
Request â†’ SDK (uses cache) â†’ 402 Response (no Gateway call)
```

**Pros:**

- âœ… No Gateway API calls for 402 responses
- âœ… Lower latency (~5-10ms)
- âœ… Reduced Gateway load
- âœ… Works with CDN

**Cons:**

- âš ï¸ Configuration updates require reload
- âš ï¸ Still needs Gateway for verification/settlement
- âš ï¸ Manual price updates

## Mode 3: Downloaded File (Coming Soon)

**How it works:**

- Configuration stored in local file
- SDK reads from filesystem
- No external dependencies for 402 responses

**Use cases:**

- Air-gapped deployments
- Offline systems
- Maximum security requirements
- No external connectivity

**Example:**

```typescript
// Future implementation
app.use(
  prismPaymentMiddleware(
    {
      apiKey: "dev-key-123",
      mode: "file",
      configFilePath: "./config/prism-config.json",
    },
    routes,
  ),
);
```

**Configuration format:**
Same as cloud mode, but stored locally:

```
project/
â”œâ”€â”€ config/
â”‚   â””â”€â”€ prism-config.json  # Downloaded from Gateway
â”œâ”€â”€ src/
â””â”€â”€ package.json
```

**Flow:**

```
Startup â†’ Load Config from File â†’ Cache in Memory
Request â†’ SDK (uses cache) â†’ 402 Response (no Gateway call)
```

**Pros:**

- âœ… No external calls for 402 responses
- âœ… Works completely offline
- âœ… Fastest response times
- âœ… No CDN dependencies

**Cons:**

- âš ï¸ Manual configuration updates
- âš ï¸ Still needs Gateway for verification/settlement
- âš ï¸ Configuration can become stale

## Comparison

| Feature                     | On-Demand     | Cloud         | File          |
| --------------------------- | ------------- | ------------- | ------------- |
| **Gateway API calls (402)** | Every request | None          | None          |
| **Latency (402)**           | ~100ms        | ~10ms         | ~5ms          |
| **Config updates**          | Instant       | Manual reload | Manual reload |
| **Offline capable**         | âŒ            | âŒ            | âœ…            |
| **Dynamic pricing**         | âœ…            | âŒ            | âŒ            |
| **CDN support**             | N/A           | âœ…            | N/A           |

## Verification & Settlement

**All modes require Gateway connectivity** for:

- Payment verification (when X-PAYMENT header is present)
- Payment settlement (after successful response)

Only 402 response generation differs between modes.

## Choosing a Mode

### Use On-Demand when:

- You need dynamic pricing
- Configuration changes frequently
- You have low-moderate traffic
- You want the simplest setup

### Use Cloud when:

- You have high traffic
- You want to minimize Gateway API calls
- Pricing is relatively static
- You can use CDN caching

### Use File when:

- You need offline capability
- You have air-gapped environments
- You have maximum security requirements
- You can manage configuration manually

## Future Implementation Timeline

- **Q4 2025**: Cloud configuration mode
- **Q1 2026**: File configuration mode
- **Q2 2026**: Hybrid modes (fallback chains)

## Next Steps

- [TypeScript SDK Documentation](../../typescript/README.md)
- [C# SDK Documentation](../../csharp/README.md) _(coming soon)_
- [Python SDK Documentation](../../python/README.md) _(coming soon)_
