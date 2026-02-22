# x402 Protocol Compatibility Layer

This module provides seamless interoperability between x402 protocol v1 and v2.

## Overview

**Protocol v2 is the default**. v1 is supported for backward compatibility during the migration period.

### Key Differences: v1 vs v2

| Feature                 | v1                   | v2                         |
| ----------------------- | -------------------- | -------------------------- |
| **Network IDs**         | `"base-sepolia"`     | `"eip155:84532"` (CAIP-2)  |
| **Request Header**      | `X-PAYMENT`          | `PAYMENT-SIGNATURE`        |
| **Response Header**     | `X-PAYMENT-RESPONSE` | `PAYMENT-RESPONSE`         |
| **Requirements Header** | Response body        | `PAYMENT-REQUIRED`         |
| **Resource Info**       | Inside `accepts[]`   | Separate `resource` object |
| **Amount Field**        | `maxAmountRequired`  | `amount`                   |
| **Payload Structure**   | Flat                 | Nested with `accepted`     |

## Usage

### Auto-Detection

The compatibility layer automatically detects protocol versions:

```typescript
import { detectProtocolVersion, HeaderAdapter } from "@financedistrict/prism-x402-sdk";

// Detect from payload
const version = detectProtocolVersion(payloadData); // 1 or 2

// Read headers (works with both v1 and v2)
const payload = HeaderAdapter.getPaymentPayload((name) => req.headers[name]);
```

### Network ID Conversion

```typescript
import {
  networkV1ToV2,
  networkV2ToV1,
  normalizeNetwork,
} from "@financedistrict/prism-x402-sdk";

// v1 → v2
const v2Network = networkV1ToV2("base-sepolia"); // "eip155:84532"

// v2 → v1
const v1Network = networkV2ToV1("eip155:84532"); // "base-sepolia"

// Auto-normalize to target version
const normalized = normalizeNetwork("base-sepolia", 2); // "eip155:84532"
```

### Schema Transformation

```typescript
import {
  SchemaTransformer,
  upgradePaymentRequiredResponse,
  downgradePaymentPayload,
} from "@financedistrict/prism-x402-sdk";

// Upgrade v1 → v2
const v2Response = upgradePaymentRequiredResponse(v1Response);

// Downgrade v2 → v1
const v1Payload = downgradePaymentPayload(v2Payload);

// Generic transformation
const transformed = SchemaTransformer.transformPaymentRequired(
  response,
  targetVersion // 1 or 2
);
```

### Header Management

```typescript
import { HeaderAdapter, V2_HEADERS } from "@financedistrict/prism-x402-sdk";

// Write headers (defaults to v2)
HeaderAdapter.setPaymentPayload(
  (name, value) => res.setHeader(name, value),
  base64Payload
);

// Write v1 headers
HeaderAdapter.setPaymentPayload(
  (name, value) => res.setHeader(name, value),
  base64Payload,
  1 // v1
);

// Read headers (auto-detects v1 or v2)
const payload = HeaderAdapter.getPaymentPayload((name) => req.headers[name]);
```

## Migration Strategy

### Phase 1: Dual Support (Current)

- SDK supports both v1 and v2
- v2 is default for new integrations
- v1 works for existing integrations
- Auto-detection handles mixed environments

### Phase 2: v1 Deprecation (Q2 2026)

- Warning logs when v1 is used
- Documentation shows v2 as primary
- Migration guide published

### Phase 3: v1 Removal (Q4 2026)

- v1 support removed in v2.0.0
- Breaking change announcement
- 6-month migration window

## Testing

Run compatibility tests:

```bash
npm test compatibility
```

## API Reference

### Network Mapper

- `NETWORK_V1_TO_V2` - Mapping table
- `NETWORK_V2_TO_V1` - Reverse mapping
- `isV2Network(network)` - Check if CAIP-2 format
- `networkV1ToV2(v1Network)` - Convert to v2
- `networkV2ToV1(v2Network)` - Convert to v1
- `normalizeNetwork(network, version)` - Normalize to target version
- `extractChainId(v2Network)` - Extract EVM chain ID

### Header Adapter

- `HeaderAdapter.getPaymentPayload(getHeader)` - Read payment (v1 or v2)
- `HeaderAdapter.setPaymentPayload(setHeader, payload, version)` - Write payment
- `HeaderAdapter.getSettlementResponse(getHeader)` - Read settlement (v1 or v2)
- `HeaderAdapter.setSettlementResponse(setHeader, response, version)` - Write settlement
- `HeaderAdapter.detectVersionFromHeaders(getHeader)` - Detect version from headers

### Version Detector

- `detectProtocolVersion(payload)` - Auto-detect version
- `isV1Payload(payload)` - Check if v1
- `isV2Payload(payload)` - Check if v2
- `getDefaultProtocolVersion()` - Returns 2

### Schema Transformer

- `SchemaTransformer.transformPaymentRequired(payload, targetVersion)` - Transform requirements
- `SchemaTransformer.transformPaymentPayload(payload, targetVersion, context)` - Transform payload
- `SchemaTransformer.transformSettlementResponse(response, targetVersion)` - Transform settlement
- `upgradePaymentRequirements(v1)` - v1 → v2
- `downgradePaymentRequirements(v2, resource)` - v2 → v1
- `upgradePaymentRequiredResponse(v1)` - v1 → v2
- `downgradePaymentRequiredResponse(v2)` - v2 → v1
- `upgradePaymentPayload(v1, accepted, resource)` - v1 → v2
- `downgradePaymentPayload(v2)` - v2 → v1
- `upgradeSettlementResponse(v1)` - v1 → v2
- `downgradeSettlementResponse(v2)` - v2 → v1

## Examples

### Middleware with Dual Support

```typescript
import {
  HeaderAdapter,
  detectProtocolVersion,
  SchemaTransformer,
} from "@financedistrict/prism-x402-sdk";

// In your middleware
const version =
  HeaderAdapter.detectVersionFromHeaders((name) => req.headers[name]) || 2; // default to v2

// Read payment (works with both)
const payloadBase64 = HeaderAdapter.getPaymentPayload(
  (name) => req.headers[name]
);

// ... process payment ...

// Write response in same version
HeaderAdapter.setSettlementResponse(
  (name, value) => res.setHeader(name, value),
  responseBase64,
  version
);
```

### Client with Auto-Upgrade

```typescript
// Client receives v1 402 response, auto-upgrades to v2
const v1Response = await fetch(url);
if (v1Response.status === 402) {
  const v1Body = await v1Response.json();

  // Auto-upgrade to v2
  const v2Requirements = upgradePaymentRequiredResponse(v1Body);

  // Work with v2 internally
  const payment = await createPayment(v2Requirements.accepts[0]);

  // Send in v2 format
  await fetch(url, {
    headers: {
      "PAYMENT-SIGNATURE": base64Encode(payment),
    },
  });
}
```

## Contributing

When adding new protocol features:

1. Add types to both `v1.ts` and `v2.ts`
2. Add transformation logic to `schema-transformer.ts`
3. Add tests for both directions (v1→v2 and v2→v1)
4. Update this README with examples

## License

MIT
