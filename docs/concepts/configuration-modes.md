# Configuration Modes

Prism SDK supports different modes for generating payment requirements, each suited for different use cases.

## Overview

| Mode          | When to Use                             | Implementation Status |
| ------------- | --------------------------------------- | --------------------- |
| **On-Demand** | Dynamic pricing, real-time updates      | ✅ Implemented        |
| **Cloud**     | Static config, CDN distribution         | 🔜 Coming Soon        |
| **File**      | Offline deployments, air-gapped systems | 🔜 Coming Soon        |

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
Request → SDK → Prism Gateway API → Payment Requirements → 402 Response
```

**Pros:**

- ✅ Always up-to-date
- ✅ Real-time asset/network availability
- ✅ Dynamic pricing support
- ✅ No local configuration needed

**Cons:**

- ⚠️ Requires Gateway API call for each 402 response
- ⚠️ Slight latency overhead (~50-100ms)
- ⚠️ Depends on Gateway availability

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
Startup → Load Config from Cloud → Cache Locally
Request → SDK (uses cache) → 402 Response (no Gateway call)
```

**Pros:**

- ✅ No Gateway API calls for 402 responses
- ✅ Lower latency (~5-10ms)
- ✅ Reduced Gateway load
- ✅ Works with CDN

**Cons:**

- ⚠️ Configuration updates require reload
- ⚠️ Still needs Gateway for verification/settlement
- ⚠️ Manual price updates

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
├── config/
│   └── prism-config.json  # Downloaded from Gateway
├── src/
└── package.json
```

**Flow:**

```
Startup → Load Config from File → Cache in Memory
Request → SDK (uses cache) → 402 Response (no Gateway call)
```

**Pros:**

- ✅ No external calls for 402 responses
- ✅ Works completely offline
- ✅ Fastest response times
- ✅ No CDN dependencies

**Cons:**

- ⚠️ Manual configuration updates
- ⚠️ Still needs Gateway for verification/settlement
- ⚠️ Configuration can become stale

## Comparison

| Feature                     | On-Demand     | Cloud         | File          |
| --------------------------- | ------------- | ------------- | ------------- |
| **Gateway API calls (402)** | Every request | None          | None          |
| **Latency (402)**           | ~100ms        | ~10ms         | ~5ms          |
| **Config updates**          | Instant       | Manual reload | Manual reload |
| **Offline capable**         | ❌            | ❌            | ✅            |
| **Dynamic pricing**         | ✅            | ❌            | ❌            |
| **CDN support**             | N/A           | ✅            | N/A           |

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
