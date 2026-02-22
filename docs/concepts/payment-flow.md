# Payment Flow

Understanding how payments work from request to settlement.

## Complete Flow Diagram

```
┌─────────┐                ┌─────────┐                ┌─────────┐
│ Client  │                │ Server  │                │ Gateway │
└────┬────┘                └────┬────┘                └────┬────┘
     │                          │                          │
     │  1. GET /api/premium     │                          │
     ├─────────────────────────>│                          │
     │                          │                          │
     │                          │  2. POST /payment/requirements
     │                          ├─────────────────────────>│
     │                          │                          │
     │                          │  3. PaymentRequirements  │
     │                          │<─────────────────────────┤
     │                          │                          │
     │  4. 402 Payment Required │                          │
     │<─────────────────────────┤                          │
     │                          │                          │
     │  5. Sign transaction     │                          │
     │  (off-chain)             │                          │
     │                          │                          │
     │  6. GET /api/premium     │                          │
     │  X-PAYMENT: <signed>     │                          │
     ├─────────────────────────>│                          │
     │                          │                          │
     │                          │  7. POST /payment/verify │
     │                          ├─────────────────────────>│
     │                          │                          │
     │                          │  8. { isValid: true }    │
     │                          │<─────────────────────────┤
     │                          │                          │
     │                          │  9. Process request      │
     │                          │                          │
     │                          │  10. POST /payment/settle│
     │                          ├─────────────────────────>│
     │                          │                          │
     │                          │  11. Submit to blockchain│
     │                          │      Wait for confirmation
     │                          │                          │
     │                          │  12. { success, txHash } │
     │                          │<─────────────────────────┤
     │                          │                          │
     │  13. 200 OK              │                          │
     │  X-PAYMENT-RESPONSE      │                          │
     │<─────────────────────────┤                          │
     │                          │                          │
```

## Step-by-Step Breakdown

### Step 1: Initial Request (No Payment)

Client makes a request to a protected resource:

```http
GET /api/premium HTTP/1.1
Host: api.example.com
```

### Step 2-3: Get Payment Requirements

Server calls Prism Gateway to get payment options:

```http
POST /api/v1/payment/requirements HTTP/1.1
Host: prism-gw.test.1stdigital.tech
X-API-Key: dev-key-123
Content-Type: application/json

{
  "resourceUrl": "https://api.example.com/api/premium",
  "requestedAmount": 0.01,
  "description": "Premium API access",
  "mimeType": "application/json"
}
```

### Step 4: Return 402 Response

Server returns payment requirements to client:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "10000",
    "payTo": "0x...",
    "asset": "0x...",
    ...
  }],
  "error": "Payment required to access this resource"
}
```

### Step 5: Client Signs Transaction

Client creates and signs the payment transaction off-chain (no gas fees yet):

```typescript
// Using EIP-3009 transferWithAuthorization
const signature = await wallet.signTypedData({
  domain: { name: "USDC", version: "2", ... },
  types: { TransferWithAuthorization: [...] },
  value: {
    from: clientAddress,
    to: payToAddress,
    value: amount,
    validAfter: 0,
    validBefore: deadline,
    nonce: randomNonce
  }
});
```

### Step 6: Request with Payment

Client retries request with payment proof:

```http
GET /api/premium HTTP/1.1
Host: api.example.com
X-PAYMENT: eyJ4NDAyVmVyc2lvbiI6MSwic2NoZW1lIjoiZXhhY3QiLi4ufQ==
```

The `X-PAYMENT` header contains base64-encoded JSON with the signed transaction.

### Step 7-8: Verify Payment

Server verifies the payment signature with Gateway:

```http
POST /api/v1/payment/verify HTTP/1.1
X-API-Key: dev-key-123

{
  "paymentHeader": "eyJ4NDAyVmVyc2lvbiI6...",
  "paymentRequirements": { ... }
}
```

**Response:**

```json
{
  "isValid": true,
  "payer": "0x..."
}
```

### Step 9: Process Request

Payment is valid, server processes the request and generates response.

### Step 10-12: Settle Payment

After successful response, server settles the payment:

```http
POST /api/v1/payment/settle HTTP/1.1
X-API-Key: dev-key-123

{
  "paymentHeader": "eyJ4NDAyVmVyc2lvbiI6...",
  "paymentRequirements": { ... }
}
```

Gateway submits transaction to blockchain and waits for confirmation.

**Response:**

```json
{
  "success": true,
  "txHash": "0x123...",
  "networkId": "base-sepolia"
}
```

### Step 13: Return Response

Server returns successful response with settlement info:

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJ0eEhhc2giOi4uLn0=

{
  "data": "Premium content"
}
```

## Important Notes

### Gas-less for Client and Server

- ✅ Client signs transaction off-chain (no gas)
- ✅ Server doesn't need wallet or gas
- ✅ Prism Gateway handles blockchain submission
- ✅ Gateway pays gas fees

### Settlement Timing

**Immediate verification** (< 100ms)

- Cryptographic signature verification
- No blockchain interaction needed

**Delayed settlement** (2-30 seconds)

- Actual blockchain transaction
- Happens after response is sent
- Asynchronous process

### Error Handling

If settlement fails:

- Payment is NOT executed on-chain
- Client can retry with same signed payload
- Server can track failed settlements

## Next Steps

- [Configuration Modes](./configuration-modes.md)
- [TypeScript SDK Guide](../../typescript/README.md)
