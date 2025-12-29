# 🔄 x402 Protocol v1 → v2 Migration Analysis

**Last Updated:** December 23, 2025  
**Source:** https://github.com/coinbase/x402/tree/main/specs  
**Status:** ⚠️ Breaking changes require dual protocol support

---

## 📊 Executive Summary

Coinbase has released **x402 Protocol v2** with **4 critical breaking changes** that will impact all existing implementations. Our FD Prism SDK must support **both v1 and v2 simultaneously** to maintain backward compatibility while enabling new features.

**Key Impact Areas:**

- 🔴 HTTP header names changed (3 headers)
- 🔴 Network identifier format changed (CAIP-2 standard)
- 🔴 Schema structure refactored (resource info separated)
- 🟡 Field requirement changes (some fields now optional)

---

## 🚨 Breaking Change #1: HTTP Headers

### Header Name Changes

| Purpose             | v1 Header            | v2 Header           | Direction       |
| ------------------- | -------------------- | ------------------- | --------------- |
| Payment Payload     | `X-PAYMENT`          | `PAYMENT-SIGNATURE` | Client → Server |
| Payment Required    | Response body        | `PAYMENT-REQUIRED`  | Server → Client |
| Settlement Response | `X-PAYMENT-RESPONSE` | `PAYMENT-RESPONSE`  | Server → Client |

### Impact on FD Prism SDK

**Current State:**

- TypeScript/Python: Uses `X-PAYMENT-RESPONSE`
- Java: Uses `X-Settlement` (already inconsistent!)

**Required Changes:**

```typescript
// v1 (current)
req.headers["X-PAYMENT"] = base64Payload;
res.headers["X-PAYMENT-RESPONSE"] = base64Settlement;

// v2 (new)
req.headers["PAYMENT-SIGNATURE"] = base64Payload;
res.headers["PAYMENT-REQUIRED"] = base64Requirements;
res.headers["PAYMENT-RESPONSE"] = base64Settlement;
```

**Migration Strategy:**

- ✅ Auto-detect protocol version from payload
- ✅ Read from **both** old and new header names
- ✅ Write to correct header based on version

---

## 🚨 Breaking Change #2: Network Identifiers

### Format Change: String → CAIP-2

v2 adopts [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md) standard for blockchain network identification.

**Format:** `{namespace}:{reference}`

### Migration Table

| v1 Network ID       | v2 CAIP-2 ID      | Chain                  |
| ------------------- | ----------------- | ---------------------- |
| `base-sepolia`      | `eip155:84532`    | Base Sepolia Testnet   |
| `base`              | `eip155:8453`     | Base Mainnet           |
| `ethereum-mainnet`  | `eip155:1`        | Ethereum Mainnet       |
| `ethereum-sepolia`  | `eip155:11155111` | Ethereum Sepolia       |
| `polygon-mainnet`   | `eip155:137`      | Polygon Mainnet        |
| `avalanche-fuji`    | `eip155:43113`    | Avalanche Fuji Testnet |
| `avalanche-mainnet` | `eip155:43114`    | Avalanche Mainnet      |
| `arbitrum-mainnet`  | `eip155:42161`    | Arbitrum One           |
| `optimism-mainnet`  | `eip155:10`       | Optimism Mainnet       |

**CAIP-2 Namespaces:**

- `eip155`: Ethereum and EVM-compatible chains
- `solana`: Solana (e.g., `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`)
- `bip122`: Bitcoin (e.g., `bip122:000000000019d6689c085ae165831e93`)
- `cosmos`: Cosmos chains

### Implementation

```typescript
// v1 → v2 network mapper
const NETWORK_V1_TO_V2: Record<string, string> = {
  "base-sepolia": "eip155:84532",
  base: "eip155:8453",
  "ethereum-mainnet": "eip155:1",
  "ethereum-sepolia": "eip155:11155111",
  "polygon-mainnet": "eip155:137",
  "avalanche-fuji": "eip155:43113",
  "avalanche-mainnet": "eip155:43114",
  "arbitrum-mainnet": "eip155:42161",
  "optimism-mainnet": "eip155:10",
};

// v2 → v1 network mapper (for backward compatibility)
const NETWORK_V2_TO_V1: Record<string, string> = Object.fromEntries(
  Object.entries(NETWORK_V1_TO_V2).map(([k, v]) => [v, k])
);

function normalizeNetwork(network: string, targetVersion: 1 | 2): string {
  if (targetVersion === 2 && !network.includes(":")) {
    return NETWORK_V1_TO_V2[network] || network;
  }
  if (targetVersion === 1 && network.includes(":")) {
    return NETWORK_V2_TO_V1[network] || network;
  }
  return network;
}
```

---

## 🚨 Breaking Change #3: Schema Structure

### PaymentRequired Response

**v1 Structure:**

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "10000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "resource": "https://api.example.com/premium-data",
      "description": "Access to premium market data",
      "mimeType": "application/json",
      "outputSchema": null,
      "maxTimeoutSeconds": 60,
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ]
}
```

**v2 Structure:**

```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:84532",
      "amount": "10000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "maxTimeoutSeconds": 60,
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ],
  "extensions": {}
}
```

**Key Changes:**

- ✅ `resource` extracted as separate top-level object
- ✅ `maxAmountRequired` → `amount` (simplified naming)
- ❌ `outputSchema` removed (unused in practice)
- ❌ `resource`, `description`, `mimeType` removed from accepts array

### PaymentPayload Structure

**v1 Structure:**

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": {
    "signature": "0x...",
    "authorization": {
      "from": "0x...",
      "to": "0x...",
      "value": "10000",
      "validAfter": "1740672089",
      "validBefore": "1740672154",
      "nonce": "0x..."
    }
  }
}
```

**v2 Structure:**

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "eip155:84532",
    "amount": "10000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "maxTimeoutSeconds": 60,
    "extra": {
      "name": "USDC",
      "version": "2"
    }
  },
  "payload": {
    "signature": "0x...",
    "authorization": {
      "from": "0x...",
      "to": "0x...",
      "value": "10000",
      "validAfter": "1740672089",
      "validBefore": "1740672154",
      "nonce": "0x..."
    }
  },
  "extensions": {}
}
```

**Key Changes:**

- ✅ `accepted` field now contains full `PaymentRequirements` object
- ✅ `resource` info included in payload
- ✅ Client explicitly shows which requirement was accepted
- ❌ Top-level `scheme` and `network` removed (moved into `accepted`)

**Rationale:** v2 makes it explicit which payment requirement the client chose, improving clarity and enabling better validation.

---

## 🟡 Breaking Change #4: Field Requirements

### Changed from Required → Optional

| Field                  | Location           | v1       | v2       | Impact                 |
| ---------------------- | ------------------ | -------- | -------- | ---------------------- |
| `error`                | PaymentRequired    | Required | Optional | Can omit error message |
| `resource.description` | PaymentRequired    | Required | Optional | Can omit description   |
| `resource.mimeType`    | PaymentRequired    | Required | Optional | Can omit MIME type     |
| `resource`             | PaymentPayload     | N/A      | Optional | Can omit resource info |
| `payer`                | SettlementResponse | Required | Optional | Can omit on success    |

### Changed Field Names

| v1 Field            | v2 Field | Location            |
| ------------------- | -------- | ------------------- |
| `maxAmountRequired` | `amount` | PaymentRequirements |

**Impact:** Validation logic must be relaxed for v2 protocol. Optional fields should have sensible defaults.

---

## 🔧 Settlement Response Changes

### v1 Settlement Response

```json
{
  "success": true,
  "transaction": "0x1234...abcd",
  "network": "base-sepolia",
  "payer": "0x857b...6b66" // REQUIRED
}
```

### v2 Settlement Response

```json
{
  "success": true,
  "transaction": "0x1234...abcd",
  "network": "eip155:84532",
  "payer": "0x857b...6b66" // OPTIONAL
}
```

**Rationale:** `payer` is already known from the authorization payload, making it redundant in success responses.

---

## 📋 TODO: Extensions System

**Status:** 🚧 Deferred for Phase 2

v2 introduces a standardized `extensions` mechanism for optional protocol features:

```json
{
  "extensions": {
    "session-tracking": {
      "info": {"sessionId": "abc123"},
      "schema": {...}
    }
  }
}
```

**Use Cases:**

- Session management
- Budget tracking
- Custom metadata
- Rate limiting info
- Analytics data

**Action Items:**

- [ ] Research common extension patterns
- [ ] Design FD Prism-specific extensions
- [ ] Implement extension validation
- [ ] Document extension API

---

## 🎯 FD Prism SDK Migration Strategy

### Phase 1: Dual Protocol Support (Week 1)

**Goal:** Support both v1 and v2 without breaking existing clients

#### 1.1 Protocol Detection

```typescript
function detectProtocolVersion(payload: unknown): 1 | 2 {
  const obj =
    typeof payload === "string"
      ? JSON.parse(Buffer.from(payload, "base64").toString())
      : payload;

  return obj.x402Version === 2 ? 2 : 1;
}
```

#### 1.2 Header Compatibility Layer

```typescript
class HeaderAdapter {
  // Read from either v1 or v2 headers
  getPaymentPayload(req: Request): string | null {
    return req.headers["PAYMENT-SIGNATURE"] || req.headers["X-PAYMENT"] || null;
  }

  // Write to correct header based on version
  setPaymentResponse(res: Response, payload: string, version: 1 | 2) {
    const header = version === 2 ? "PAYMENT-RESPONSE" : "X-PAYMENT-RESPONSE";
    res.setHeader(header, payload);
  }

  setPaymentRequired(res: Response, payload: string, version: 1 | 2) {
    if (version === 2) {
      res.setHeader("PAYMENT-REQUIRED", payload);
    }
    // v1 uses response body instead
  }
}
```

#### 1.3 Network ID Normalization

```typescript
class NetworkAdapter {
  toV2(v1Network: string): string {
    return NETWORK_V1_TO_V2[v1Network] || v1Network;
  }

  toV1(v2Network: string): string {
    return NETWORK_V2_TO_V1[v2Network] || v2Network;
  }

  normalize(network: string, targetVersion: 1 | 2): string {
    if (targetVersion === 2 && !network.includes(":")) {
      return this.toV2(network);
    }
    if (targetVersion === 1 && network.includes(":")) {
      return this.toV1(network);
    }
    return network;
  }
}
```

#### 1.4 Schema Transformation

```typescript
class SchemaAdapter {
  // Transform v1 PaymentRequired → v2
  upgradePaymentRequired(v1: V1PaymentRequired): V2PaymentRequired {
    const firstAccept = v1.accepts[0];
    return {
      x402Version: 2,
      error: v1.error,
      resource: {
        url: firstAccept.resource,
        description: firstAccept.description,
        mimeType: firstAccept.mimeType,
      },
      accepts: v1.accepts.map((accept) => ({
        scheme: accept.scheme,
        network: networkAdapter.toV2(accept.network),
        amount: accept.maxAmountRequired,
        asset: accept.asset,
        payTo: accept.payTo,
        maxTimeoutSeconds: accept.maxTimeoutSeconds,
        extra: accept.extra,
      })),
      extensions: {},
    };
  }

  // Transform v2 PaymentRequired → v1
  downgradePaymentRequired(v2: V2PaymentRequired): V1PaymentRequired {
    return {
      x402Version: 1,
      error: v2.error || "Payment required",
      accepts: v2.accepts.map((accept) => ({
        scheme: accept.scheme,
        network: networkAdapter.toV1(accept.network),
        maxAmountRequired: accept.amount,
        asset: accept.asset,
        payTo: accept.payTo,
        resource: v2.resource.url,
        description: v2.resource.description || "",
        mimeType: v2.resource.mimeType || "application/json",
        outputSchema: null,
        maxTimeoutSeconds: accept.maxTimeoutSeconds,
        extra: accept.extra,
      })),
    };
  }

  // Transform v1 PaymentPayload → v2
  upgradePaymentPayload(
    v1: V1PaymentPayload,
    resource?: ResourceInfo
  ): V2PaymentPayload {
    return {
      x402Version: 2,
      resource,
      accepted: {
        scheme: v1.scheme,
        network: networkAdapter.toV2(v1.network),
        // Need to get amount from requirements context
      },
      payload: v1.payload,
      extensions: {},
    };
  }

  // Transform v2 PaymentPayload → v1
  downgradePaymentPayload(v2: V2PaymentPayload): V1PaymentPayload {
    return {
      x402Version: 1,
      scheme: v2.accepted.scheme,
      network: networkAdapter.toV1(v2.accepted.network),
      payload: v2.payload,
    };
  }
}
```

### Phase 2: v2-First Implementation (Week 2)

**Goal:** Default to v2 protocol while maintaining v1 compatibility

#### 2.1 Configuration

```typescript
interface PrismConfig {
  x402Version: 1 | 2 | "auto"; // Default: 'auto'
  fallbackToV1: boolean; // Default: true
  strictMode: boolean; // Default: false (allow both)
}
```

#### 2.2 Middleware Updates

Update all 8 framework implementations:

- ✅ Express.js
- ✅ Fastify
- ✅ HTTP
- ✅ NestJS
- ✅ Next.js
- ✅ Flask
- ✅ FastAPI
- ✅ Django

**Each middleware needs:**

1. Protocol version detection
2. Header adapter integration
3. Schema transformation layer
4. Backward compatibility mode

### Phase 3: v1 Deprecation (Q2 2026)

**Timeline:**

- **Q1 2026**: Announce v1 deprecation, all docs show v2 examples
- **Q2 2026**: v1 support marked as deprecated in code
- **Q3 2026**: Remove v1 support in major version bump (2.0.0)

---

## 📊 Migration Complexity Assessment

| Component             | Complexity | Effort   | Risk   |
| --------------------- | ---------- | -------- | ------ |
| Header Adapter        | 🟢 Low     | 4 hours  | Low    |
| Network ID Mapper     | 🟢 Low     | 2 hours  | Low    |
| Schema Transformer    | 🟡 Medium  | 16 hours | Medium |
| Validation Updates    | 🟡 Medium  | 8 hours  | Low    |
| Framework Integration | 🔴 High    | 40 hours | Medium |
| Testing (v1 + v2)     | 🔴 High    | 32 hours | High   |
| Documentation         | 🟡 Medium  | 16 hours | Low    |

**Total Estimated Effort:** ~118 hours (~3 weeks for 1 developer)

---

## ✅ Testing Strategy

### Test Matrix

| Test Case              | v1  | v2  | Mixed |
| ---------------------- | --- | --- | ----- |
| Payment flow (success) | ✅  | ✅  | ✅    |
| Payment flow (failure) | ✅  | ✅  | ✅    |
| Network ID conversion  | ✅  | ✅  | ✅    |
| Header reading         | ✅  | ✅  | ✅    |
| Header writing         | ✅  | ✅  | N/A   |
| Schema validation      | ✅  | ✅  | ✅    |
| Backward compatibility | ✅  | N/A | ✅    |
| Forward compatibility  | N/A | ✅  | ✅    |

### Integration Tests

```typescript
describe("x402 v1/v2 Compatibility", () => {
  it("should accept v1 client with v1 server", async () => {
    const client = new PrismClient({ x402Version: 1 });
    const server = createServer({ x402Version: 1 });
    // Test payment flow
  });

  it("should accept v2 client with v2 server", async () => {
    const client = new PrismClient({ x402Version: 2 });
    const server = createServer({ x402Version: 2 });
    // Test payment flow
  });

  it("should accept v1 client with v2 server (backward compat)", async () => {
    const client = new PrismClient({ x402Version: 1 });
    const server = createServer({ x402Version: 2, fallbackToV1: true });
    // Test automatic downgrade
  });

  it("should accept v2 client with v1 server (forward compat)", async () => {
    const client = new PrismClient({ x402Version: 2 });
    const server = createServer({ x402Version: 1 });
    // Server should reject or auto-detect and accept
  });
});
```

---

## 📚 Documentation Updates Required

### User-Facing Docs

1. **Migration Guide** (`docs-mintlify/guides/v1-to-v2-migration.mdx`)
   - What changed and why
   - Code examples showing v1 → v2 conversion
   - Timeline for deprecation
2. **API Reference** (all SDK docs)
   - Add `x402Version` parameter to all examples
   - Show both v1 and v2 examples side-by-side
   - Mark v1 examples as deprecated
3. **Network IDs** (`docs-mintlify/concepts/networks.mdx`)
   - New page documenting CAIP-2 format
   - Conversion table for all supported chains
   - Auto-detection behavior

### Internal Docs

1. **Architecture Decision Record** (`ADR-005-x402-v2-support.md`)
   - Why dual protocol support
   - Trade-offs considered
   - Long-term strategy
2. **Implementation Guide** (this document)
   - Technical details for contributors
   - Testing requirements
   - Release checklist

---

## 🚀 Competitive Advantage

### Why This Matters

**Coinbase x402 Status:**

- ✅ v2 spec published
- ⚠️ SDKs partially updated (TypeScript only?)
- ❌ Many integrations still on v1

**FD Prism SDK Opportunity:**

- 🎯 **First to market** with production-ready dual protocol support
- 🎯 **Zero-downtime migration** for existing clients
- 🎯 **Clear migration path** with detailed documentation
- 🎯 **Automatic protocol detection** (no config changes needed)

### Marketing Angle

> "While Coinbase x402 v2 introduces breaking changes that require manual migration, FD Prism SDK v1.2 automatically supports both protocols. Your existing integrations continue working while you migrate to v2 at your own pace."

---

## 📅 Implementation Timeline

### Week 1: Foundation

- [ ] Day 1-2: Network ID mapper + tests
- [ ] Day 3-4: Header adapter + tests
- [ ] Day 5: Schema transformer (basic version)

### Week 2: Core Integration

- [ ] Day 1-2: Update TypeScript core package
- [ ] Day 3-4: Update Python core package
- [ ] Day 5: Update Java core classes

### Week 3: Framework Integration

- [ ] Day 1: Express + Fastify + HTTP
- [ ] Day 2: NestJS + Next.js
- [ ] Day 3: Flask + FastAPI + Django
- [ ] Day 4: Integration tests
- [ ] Day 5: Documentation

### Week 4: Testing & Release

- [ ] Day 1-2: Comprehensive testing (all combinations)
- [ ] Day 3: Documentation review + examples
- [ ] Day 4: Beta release (internal testing)
- [ ] Day 5: Production release

---

## 🎓 Lessons from Competitors

### What Coinbase Did Wrong

1. **No backward compatibility layer** - Breaking changes with no migration path
2. **Incomplete documentation** - Spec published but implementation examples missing
3. **SDK fragmentation** - TypeScript updated, Python/Java lagging behind
4. **No deprecation timeline** - Users don't know when v1 support ends

### What FD Prism Will Do Right

1. ✅ **Automatic protocol detection** - No config changes required
2. ✅ **Dual protocol support** - Both v1 and v2 work simultaneously
3. ✅ **Clear migration timeline** - 6-month deprecation window
4. ✅ **Unified release** - All languages/frameworks updated together
5. ✅ **Migration tooling** - Automated code transformation where possible

---

## 📞 Next Steps

1. **Review this analysis** with the team
2. **Get approval** on migration strategy
3. **Create GitHub issues** for each implementation task
4. **Start with Phase 1** (dual protocol support)
5. **Communicate timeline** to existing clients

---

## 📖 References

- [x402 v1 Specification](https://github.com/coinbase/x402/blob/main/specs/x402-specification-v1.md)
- [x402 v2 Specification](https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md)
- [CAIP-2: Blockchain ID Specification](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md)
- [x402 HTTP Transport v1](https://github.com/coinbase/x402/blob/main/specs/transports-v1/http.md)
- [x402 HTTP Transport v2](https://github.com/coinbase/x402/blob/main/specs/transports-v2/http.md)
