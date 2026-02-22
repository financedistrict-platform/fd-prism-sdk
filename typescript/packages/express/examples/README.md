# Prism Express Examples

## Quick Start

### 1. Build the packages

```bash
cd ../../../  # Go to typescript root
npm run build
```

### 2. Run the example server

```bash
cd packages/express/examples
node basic-server.js
```

### 3. Test the endpoints

Open your browser or use curl:

**Free route (no payment required):**

```bash
curl http://localhost:3000/
```

**Protected routes (require payment):**

```bash
# Will return 402 Payment Required with payment requirements
curl http://localhost:3000/api/premium
curl http://localhost:3000/weather
curl http://localhost:3000/data/users
```

## Debug Mode

The example has `debug: true` enabled by default. You'll see detailed console logs:

```
[PrismMiddlewareCore] handleRequest: { path: '/api/premium', hasPaymentHeader: false, resourceUrl: '...' }
[PrismMiddlewareCore] Matched route: /api/premium
[PrismMiddlewareCore] Parsed price: 0.01 from: 0.01
[PrismClient] getPaymentRequirements request: {
  "resourceUrl": "http://localhost:3000/api/premium",
  "requestedAmount": 0.01,
  "description": "Premium API access",
  "mimeType": "application/json"
}
[PrismClient] getPaymentRequirements response: { ... }
```

## Environment Variables

```bash
# Optional: Set your API key
export PRISM_API_KEY=your-actual-api-key

# Optional: Change Gateway URL
export PRISM_BASE_URL=https://prism-api.1stdigital.tech  # Production

# Run server
node basic-server.js
```

## Testing with Payment

To test actual payment flow, you'll need:

1. A valid API key from Prism Gateway
2. A payment client that supports x402 protocol
3. Send payment in `X-PAYMENT` header (base64-encoded JSON)

Example with payment header:

```bash
curl -H "X-PAYMENT: <base64-encoded-payment>" http://localhost:3000/api/premium
```

## What You'll See

### Without Payment (402 Response)

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "eip3009",
      "network": "sepolia",
      "maxAmountRequired": "10000000000000000",
      "resource": "http://localhost:3000/api/premium",
      "description": "Premium API access",
      "mimeType": "application/json",
      "payTo": "0x...",
      "maxTimeoutSeconds": 3600,
      "asset": "0x..."
    }
  ]
}
```

### With Valid Payment (200 Response + Transaction Header)

```json
{
  "message": "Welcome to Premium API!",
  "payer": "0x...",
  "data": {
    "premium": true,
    "features": [
      "Advanced analytics",
      "Priority support",
      "Custom integrations"
    ]
  }
}
```

Response headers:

```
X-PAYMENT-RESPONSE: 0x1234567890abcdef...  (transaction hash)
```
