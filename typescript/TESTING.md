# Prism SDK - Testing Guide

## Testing the Middleware

### 1. Start the Example Server

```bash
npm run build
node examples/basic-usage.js
```

### 2. Test Public Endpoint (No Payment Required)

```bash
curl http://localhost:3000/
```

Expected response:

```json
{
  "message": "Welcome to Prism API"
}
```

### 3. Test Protected Endpoint (Payment Required)

First request without payment:

```bash
curl http://localhost:3000/api/weather
```

Expected response (402 Payment Required):

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "1000",
      "resource": "http://localhost:3000/api/weather",
      "description": "Weather API access",
      "mimeType": "application/json",
      "payTo": "0x...",
      "maxTimeoutSeconds": 300,
      "asset": "0x...",
      "extra": null
    }
  ],
  "error": "Payment required to access this resource"
}
```

### 4. Test with Payment Header

```bash
curl http://localhost:3000/api/weather \
  -H "X-PAYMENT: <base64-encoded-payment-payload>"
```

**Note**: Payment verification and settlement are placeholders and will be implemented when Prism Gateway provides the endpoints.

## Testing Against Live Prism Gateway

### PowerShell Test Commands

```powershell
# Test health endpoint
Invoke-RestMethod -Uri "https://prism-gw.test.1stdigital.tech/health"

# Test auth-info
$headers = @{"X-API-Key" = "dev-key-123"}
Invoke-RestMethod -Uri "https://prism-gw.test.1stdigital.tech/api/v1/auth-info" -Headers $headers

# Test payment requirements
$headers = @{"X-API-Key" = "dev-key-123"; "Content-Type" = "application/json"}
$body = @{
  "resourceUrl" = "http://localhost:3000/api/weather"
  "requestedAmount" = 0.001
  "description" = "Weather API access"
  "mimeType" = "application/json"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://prism-gw.test.1stdigital.tech/api/v1/payment/requirements" -Method POST -Headers $headers -Body $body
```

## Current Implementation Status

### ✅ Working Features

- Route matching (exact and wildcard)
- Payment requirements generation (on-demand mode)
- 402 response handling
- Integration with Prism Gateway API

### 🚧 Placeholder Features (To Be Implemented)

- Payment verification (waiting for Prism Gateway endpoint)
- Payment settlement (waiting for Prism Gateway endpoint)
- Cloud configuration mode (Option 2)
- File configuration mode (Option 3)

## Next Steps

1. Wait for Prism Gateway to implement `/api/v1/payment/verify` endpoint
2. Wait for Prism Gateway to implement `/api/v1/payment/settle` endpoint
3. Implement cloud configuration loading (Phase 2)
4. Implement file configuration loading (Phase 2)
5. Add decorator support (Phase 2)
