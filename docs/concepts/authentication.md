# Authentication with Prism Gateway

Prism Gateway uses API key authentication to identify and authorize clients.

## API Key

Every request to Prism Gateway must include an API key in the `X-API-Key` header.

```http
GET /api/v1/auth-info
Host: prism-gw.test.1stdigital.tech
X-API-Key: your-api-key-here
```

## Obtaining an API Key

Contact Finance District to obtain your API key for:

- **Sandbox/Test environment**: For development and testing
- **Production environment**: For live transactions

## API Key Information

You can retrieve information about your API key:

```bash
curl https://prism-gw.test.1stdigital.tech/api/v1/auth-info \
  -H "X-API-Key: your-api-key"
```

**Response:**

```json
{
  "timestamp": "2025-11-05T09:28:42.170873Z",
  "clientId": "your-client-id",
  "clientName": "Your Company Name",
  "pointOfServiceId": "2a712919-7354-48a7-9fb9-e709bc39313c",
  "scopes": [
    "payments:read",
    "payments:write",
    "directory:read",
    "routing:read"
  ]
}
```

## What the API Key Provides

The API key automatically configures:

- ✅ **Client Identification** - Your unique client ID
- ✅ **Payment Address** - Where payments should be sent (`payTo`)
- ✅ **Supported Networks** - Which blockchains you can accept
- ✅ **Supported Assets** - Which tokens you can accept (USDC, FDUSD, etc.)
- ✅ **Permissions** - What operations you're allowed to perform

## Environments

### Test Environment

```typescript
{
  apiKey: "dev-key-123";
  // Defaults to: https://prism-gw.test.1stdigital.tech
}
```

Base URL: `https://prism-gw.test.1stdigital.tech` (default)

- Test tokens (no real value)
- Testnet blockchains (Base Sepolia, etc.)
- Free to use for development

### Production

```typescript
{
  apiKey: 'prod-key-xyz',
  baseUrl: 'https://prism-api.1stdigital.tech'
}
```

Base URL: `https://prism-api.1stdigital.tech`

- Real cryptocurrency
- Mainnet blockchains (Base, Ethereum, etc.)
- Actual settlements

## Security Best Practices

### ✅ DO:

- Store API keys in environment variables
- Use different keys for test and production
- Rotate keys periodically
- Restrict API key permissions to minimum required

### ❌ DON'T:

- Commit API keys to version control
- Share API keys in public channels
- Use production keys in development
- Expose keys in client-side code

## SDK Configuration

### TypeScript

```typescript
import { prismPaymentMiddleware } from "@prism/express";

app.use(
  prismPaymentMiddleware(
    {
      apiKey: process.env.PRISM_API_KEY,
      useSandbox: process.env.NODE_ENV !== "production",
    },
    routes,
  ),
);
```

### C#

```csharp
// Coming soon
app.UsePrismPayment(options => {
    options.ApiKey = configuration["Prism:ApiKey"];
    options.UseSandbox = !environment.IsProduction();
});
```

### Python

```python
# Coming soon
app.use(PrismPaymentMiddleware(
    api_key=os.getenv('PRISM_API_KEY'),
    use_sandbox=(os.getenv('ENV') != 'production')
))
```

## Troubleshooting

### 401 Unauthorized

- Check that API key is correct
- Verify you're using the right environment (sandbox vs production)
- Ensure API key hasn't expired

### 403 Forbidden

- Check that your API key has required scopes
- Verify you're calling allowed endpoints
- Contact support to review permissions

## Next Steps

- [Payment Flow](./payment-flow.md)
- [Configuration Modes](./configuration-modes.md)
