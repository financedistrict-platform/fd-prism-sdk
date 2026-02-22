# x402 Payment Protocol

The x402 protocol is an open standard for HTTP-based payments, designed to enable seamless micropayments on the internet.

## Overview

x402 leverages the HTTP `402 Payment Required` status code, which was originally reserved but never standardized. The protocol defines:

- Standard request/response format
- Payment requirement specification
- Payment payload structure
- Verification and settlement flow

## Protocol Specification

### Version

Current version: **1**

### Key Components

#### 1. Payment Required Response (402)

When a client requests a protected resource without payment:

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "10000",
      "resource": "https://api.example.com/premium",
      "description": "Premium API access",
      "mimeType": "application/json",
      "payTo": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "maxTimeoutSeconds": 300,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ],
  "error": "Payment required to access this resource"
}
```

#### 2. Payment Payload (X-PAYMENT Header)

Client includes payment proof in the `X-PAYMENT` header (base64-encoded JSON):

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": {
    "from": "0x...",
    "to": "0x...",
    "value": "10000",
    "validAfter": 0,
    "validBefore": 1735689600,
    "nonce": "0x...",
    "v": 28,
    "r": "0x...",
    "s": "0x..."
  }
}
```

#### 3. Payment Response (X-PAYMENT-RESPONSE Header)

After successful settlement, server includes transaction details:

```
X-PAYMENT-RESPONSE: base64(JSON({
  "success": true,
  "txHash": "0x...",
  "networkId": "base-sepolia"
}))
```

## Payment Schemes

### Exact Scheme

The `exact` scheme transfers a specific, predetermined amount.

**Use cases:**

- Fixed-price content (articles, downloads)
- Subscription access
- API calls with fixed cost

### Other Schemes (Future)

- `upto` - Transfer up to a maximum amount based on usage
- `streaming` - Continuous payment streams
- `subscription` - Recurring payments

## Networks

x402 is blockchain-agnostic and supports:

- **EVM Networks**: Ethereum, Base, Polygon, etc.
- **Solana**: Solana mainnet and devnet
- **Other**: Extensible to any blockchain

## Prism Implementation

Prism Gateway implements x402 with:

- ✅ `exact` scheme support
- ✅ EVM network support (Base, Ethereum)
- ✅ ERC-20 token payments (USDC, FDUSD)
- ✅ Verification and settlement
- 🔜 Solana support
- 🔜 Additional payment schemes

## References

- [x402 Official Specification](https://github.com/coinbase/x402)
- [x402 Website](https://x402.org)
- [Coinbase x402 Implementation](https://github.com/coinbase/x402/tree/main/typescript)
