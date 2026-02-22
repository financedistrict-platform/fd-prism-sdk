# Testing Guide

This guide covers how to test your Prism SDK integration, from local development to automated testing.

## Table of Contents

- [Sandbox Environment](#sandbox-environment)
- [Manual Testing](#manual-testing)
- [Automated Testing](#automated-testing)
- [Testing Payment Flows](#testing-payment-flows)
- [Common Issues](#common-issues)

## Sandbox Environment

Prism provides a test environment for development and testing:

```typescript
const config = {
  apiKey: "dev-key-123",
  // Defaults to test environment
};
```

**Test environment characteristics:**

- Base URL: `https://prism-gw.test.1stdigital.tech` (default)
- Test API keys accepted
- Test networks (e.g., `base-sepolia`, `ethereum-sepolia`)
- No real payments processed
- Faster verification times

**Production characteristics:**

- Base URL: `https://prism-api.1stdigital.tech`
- Real API keys required
- Mainnet networks (e.g., `base`, `ethereum`)
- Real payments processed
- Standard verification times

## Manual Testing

### Step 1: Test 402 Response

Make a request to a protected route without payment:

```bash
# PowerShell
Invoke-RestMethod -Uri "http://localhost:3000/api/weather" `
  -Method GET `
  -Headers @{"Accept"="application/json"}
```

**Expected response:**

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
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

### Step 2: Test With Payment

Generate a payment header and retry:

```bash
# PowerShell
$payment = "v=2;sig=0x1234...;rcpt=0x5678...;nonce=abc123"
$headers = @{
  "Accept" = "application/json"
  "X-PAYMENT" = $payment
}

Invoke-RestMethod -Uri "http://localhost:3000/api/weather" `
  -Method GET `
  -Headers $headers
```

**Expected response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "location": "San Francisco",
  "temperature": 72,
  "condition": "Sunny",
  "humidity": 60
}
```

### Step 3: Test Invalid Payment

Test error handling with invalid payment:

```bash
# PowerShell
$headers = @{
  "Accept" = "application/json"
  "X-PAYMENT" = "invalid-payment-header"
}

Invoke-RestMethod -Uri "http://localhost:3000/api/weather" `
  -Method GET `
  -Headers $headers
```

**Expected response:**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Invalid payment header format"
}
```

## Automated Testing

### Unit Tests

Test middleware behavior in isolation:

```typescript
// tests/middleware.test.ts
import { prismPaymentMiddleware } from "@financedistrict/prism-x402-sdk-express";
import { Request, Response } from "express";

describe("Prism Middleware", () => {
  it("should return 402 for protected routes without payment", async () => {
    const req = {
      path: "/api/weather",
      headers: {},
    } as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    const middleware = prismPaymentMiddleware(
      { apiKey: "dev-key-123" },
      {
        "/api/weather": {
          price: 0.001,
          description: "Weather API access",
        },
      },
    );

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() for unprotected routes", async () => {
    const req = {
      path: "/",
      headers: {},
    } as Request;

    const res = {} as Response;
    const next = jest.fn();

    const middleware = prismPaymentMiddleware(
      { apiKey: "dev-key-123" },
      {
        "/api/weather": {
          price: 0.001,
          description: "Weather API access",
        },
      },
    );

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
```

### Integration Tests

Test complete payment flows:

```typescript
// tests/integration.test.ts
import request from "supertest";
import app from "../src/app";

describe("Payment Integration", () => {
  it("should complete full payment flow", async () => {
    // Step 1: Get 402 response
    const response1 = await request(app).get("/api/weather").expect(402);

    expect(response1.body.x402Version).toBe(1);
    expect(response1.body.accepted).toBeDefined();

    // Step 2: Generate payment (mock)
    const payment = generateMockPayment(response1.body.accepted[0]);

    // Step 3: Retry with payment
    const response2 = await request(app)
      .get("/api/weather")
      .set("X-PAYMENT", payment)
      .expect(200);

    expect(response2.body.location).toBe("San Francisco");
    expect(response2.body.temperature).toBeDefined();
  });

  it("should reject invalid payment", async () => {
    await request(app)
      .get("/api/weather")
      .set("X-PAYMENT", "invalid")
      .expect(400);
  });
});
```

### Mock Prism Client

Mock Gateway API calls for faster tests:

```typescript
// tests/mocks/prism-client.mock.ts
jest.mock("../../src/client/prism-client", () => ({
  PrismClient: jest.fn().mockImplementation(() => ({
    getPaymentRequirements: jest.fn().mockResolvedValue({
      x402Version: 1,
      accepted: [
        {
          scheme: "exact",
          network: "base-sepolia",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
          maxTimeoutSeconds: 300,
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          extra: { name: "USDC", version: "2" },
        },
      ],
    }),
    verifyPayment: jest.fn().mockResolvedValue({ valid: true }),
    settlePayment: jest.fn().mockResolvedValue({ settled: true }),
  })),
}));
```

## Testing Payment Flows

### Test Scenario 1: Successful Payment

```typescript
// Complete payment flow test
describe("Successful Payment Flow", () => {
  it("should allow access after valid payment", async () => {
    // 1. Request without payment → 402
    const res1 = await request(app).get("/api/weather");
    expect(res1.status).toBe(402);

    // 2. Parse payment requirements
    const requirements = res1.body;

    // 3. Generate payment (in real scenario, client does this)
    const payment = await generatePayment(requirements);

    // 4. Request with payment → 200
    const res2 = await request(app)
      .get("/api/weather")
      .set("X-PAYMENT", payment);
    expect(res2.status).toBe(200);
    expect(res2.body.location).toBe("San Francisco");
  });
});
```

### Test Scenario 2: Expired Payment

```typescript
describe("Expired Payment", () => {
  it("should reject expired payment", async () => {
    const expiredPayment = "v=2;sig=0x...;rcpt=0x...;nonce=expired";

    const res = await request(app)
      .get("/api/weather")
      .set("X-PAYMENT", expiredPayment);

    expect(res.status).toBe(402);
    expect(res.body.error).toContain("expired");
  });
});
```

### Test Scenario 3: Wrong Network

```typescript
describe("Wrong Network Payment", () => {
  it("should reject payment from wrong network", async () => {
    // Payment generated for ethereum, but endpoint expects base
    const wrongNetworkPayment = "v=2;sig=0x...;network=ethereum";

    const res = await request(app)
      .get("/api/weather")
      .set("X-PAYMENT", wrongNetworkPayment);

    expect(res.status).toBe(402);
    expect(res.body.error).toContain("network");
  });
});
```

## Common Issues

### Issue: 401 Unauthorized

**Symptom:**

```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

**Solution:**

- Check your API key is correct
- Verify `useSandbox` matches your API key type
- Ensure API key has necessary permissions

### Issue: Gateway Timeout

**Symptom:**

```json
{
  "error": "Gateway timeout",
  "message": "Failed to fetch payment requirements"
}
```

**Solution:**

- Check network connectivity
- Verify Gateway URL is correct
- Ensure sandbox/production environment is correct
- Check Gateway status page

### Issue: Payment Not Verified

**Symptom:**

```json
{
  "error": "Payment verification failed",
  "message": "Invalid signature"
}
```

**Solution:**

- Ensure payment signature is valid
- Check payment is for correct asset/network
- Verify payment hasn't expired
- Check payment amount matches requirement

### Issue: Route Not Matched

**Symptom:** Protected route returns data without payment

**Solution:**

- Check route pattern in middleware config
- Verify route path matches exactly
- For wildcards, ensure pattern is correct (`/api/premium/*`)

## Test Coverage

Aim for comprehensive test coverage:

```typescript
// package.json
{
  "scripts": {
    "test": "jest",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch"
  }
}
```

**Coverage targets:**

- Unit tests: >90% coverage
- Integration tests: Key user flows
- E2E tests: Critical payment paths

## Next Steps

- [Production Deployment Guide](./production-deployment.md)
- [Configuration Modes](../concepts/configuration-modes.md)
- [Payment Flow](../concepts/payment-flow.md)
