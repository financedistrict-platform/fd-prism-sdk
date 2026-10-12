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

### Step 6b: Local Payment Checks

Before any call to the Gateway, the SDK compares the payment with the payment requirements it just requested for this route. The payment is rejected with `402` and the Gateway is never called when any of these checks fail:

| Check | Rule |
|-------|------|
| Accepted requirement | `scheme`, `network`, `asset`, `payTo` and `amount` in the payload's `accepted` block must equal one of the server-built requirements (addresses compare case-insensitively, amounts as exact integers) |
| Recipient | `authorization.to` must equal the requirement's `payTo` |
| Amount | `authorization.value` must equal the requirement's `amount` |
| Resource | if the payload carries `resource.url`, it must equal the requested resource URL |
| Validity window | `validAfter <= now < validBefore`, both as Unix seconds |

The same recipient, amount and `accepted` checks run again before settlement. The Gateway still performs signature and balance checks.

### Step 6c: One Proof, One Execution

After the local checks, the SDK reserves the proof before it calls the Gateway. The reservation key is the authorization's `from` address plus its `nonce` (case-insensitive), so a different signature over the same authorization is still the same proof. While a proof is reserved, every other request carrying it is rejected with `402` and never reaches your handler.

| Event | Reservation |
|-------|-------------|
| Gateway rejects the payment, or verification throws | Released, the client may retry |
| Handler responds with status `>= 400` and the status reaches `settlementCallback` | Released |
| The Gateway answers that settlement failed | Released, the client may retry with the same payload |
| Settlement throws, times out or gets a server error (outcome unknown) | Kept until the authorization's `validBefore` or the reservation limit, whichever comes first; the payment may have been broadcast, so the proof does not run the handler again |
| Settlement succeeds | Kept until the authorization's `validBefore` |
| Handler or adapter never reports back (error responses, thrown handlers) | Held until the reservation ends |

A reservation lasts until the earlier of the authorization's `validBefore` and the reservation limit, 600 seconds by default. Set the limit with `replayReservationSeconds` (TypeScript), `replay_reservation_seconds` (Python) or `ReplayReservationSeconds` (C#). A handler that runs longer than the reservation lets the same proof reserve again and run the handler a second time, so keep the limit above your slowest paid handler or use the settle-first option below. A proof is rejected as expired once `validBefore` has passed, whatever the limit.

At most 10,000 proofs are tracked. Expired entries are dropped first, then the oldest settled proof. If every slot holds an active reservation, new proofs are refused with `402`.

The guard lives in the process. Share one `PrismMiddlewareCore` / middleware instance for the whole app (in TypeScript, cores built from the same config object share one guard). Running several instances behind a load balancer does not coordinate reservations across instances.

#### Routes with side effects: settle before the handler

Reserving the proof guarantees the handler runs once per proof, but by default the payment settles after the handler. For routes whose handler has side effects, set the route option so the payment settles first and the handler runs only after settlement succeeded:

| Language | Route option |
|----------|--------------|
| TypeScript | `settleBeforeHandler: true` in the route config |
| Python | `RoutePaymentConfig(..., settle_before_handler=True)` |
| C# | `SettleBeforeHandler = true` on `RoutePaymentConfig` |

If the Gateway answers that settlement failed, the request is rejected with `402`, the handler never runs, and the proof is released for a retry. If settlement throws or times out, the request is rejected the same way but the proof stays reserved. The adapter's own post-handler settlement call reuses the stored result instead of settling a second time, so adapters need no change. If the handler then fails, the payment has already been taken and the proof stays consumed; the option trades that risk for never running a side effect on an unsettled payment. The replay guard and this option are not part of the Java SDK yet.

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
