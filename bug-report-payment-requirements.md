# Bug Report: Payment Requirements Endpoint Error

## Issue

`POST /api/v1/payment/requirements` returns 500 Internal Server Error due to missing database column.

## Error Details

```
PostgreSQL Error 42703: column p.ProviderId does not exist
POSITION: 74
```

## Environment

- **API Base URL:** `https://prism-api.test.1stdigital.tech`
- **Endpoint:** `/api/v1/payment/requirements`
- **API Key:** `2a712919-7354-48a7-9fb9-e709bc39313c.1762373359.1762978159.1.f3c0c13768f71e5c1225565f23f53c19da255324b0f8573c670e8c68e20e60db`
- **Timestamp:** 2025-11-06T13:13:00Z

## cURL Request to Reproduce

```bash
curl -X POST https://prism-api.test.1stdigital.tech/api/v1/payment/requirements \
  -H "Content-Type: application/json" \
  -H "X-API-Key: 2a712919-7354-48a7-9fb9-e709bc39313c.1762373359.1762978159.1.f3c0c13768f71e5c1225565f23f53c19da255324b0f8573c670e8c68e20e60db" \
  -d '{
    "resourceUrl": "http://localhost:3060/api/crypto/market-data",
    "requestedAmount": 0.01,
    "description": "Premium Crypto API access",
    "mimeType": "application/json"
  }'
```

## PowerShell Version (Windows)

```powershell
$headers = @{
    "Content-Type" = "application/json"
    "X-API-Key" = "2a712919-7354-48a7-9fb9-e709bc39313c.1762373359.1762978159.1.f3c0c13768f71e5c1225565f23f53c19da255324b0f8573c670e8c68e20e60db"
}

$body = @{
    resourceUrl = "http://localhost:3060/api/crypto/market-data"
    requestedAmount = 0.01
    description = "Premium Crypto API access"
    mimeType = "application/json"
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "https://prism-api.test.1stdigital.tech/api/v1/payment/requirements" `
    -Method Post `
    -Headers $headers `
    -Body $body
```

## Expected Response (HTTP 200)

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "network": "sepolia",
      "token": "USDC",
      "amount": 0.01,
      "payee": "0x...",
      "nonce": "...",
      "validUntil": 1730000000,
      ...
    }
  ]
}
```

## Actual Response (HTTP 500)

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.0",
  "title": "Internal Error",
  "status": 500,
  "detail": "42703: column p.ProviderId does not exist\n\nPOSITION: 74",
  "instance": "/api/v1/payment/requirements",
  "errorCode": "INTERNAL_ERROR",
  "timestamp": "2025-11-06T13:13:00.2646107Z",
  "traceId": "0HNGT483NH6I8:00000001"
}
```

## Root Cause

Database schema issue - the SQL query references a column `p.ProviderId` that doesn't exist in the database table.

**Likely Issue:**

- Missing database migration
- Column was renamed but query wasn't updated
- Query joins a table with alias `p` that has incorrect column reference

## Recommended Fix

1. Check database schema for the table aliased as `p` in the query
2. Verify if `ProviderId` column exists or was renamed
3. Run missing migrations if applicable
4. Update SQL query to use correct column name
