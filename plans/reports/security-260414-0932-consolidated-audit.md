# Security Audit — Consolidated Report
## `typescript/` + `python/`

**Date:** 2026-04-14  
**Branch:** `feat/sercurity-code-v1`  
**Scope:** `typescript/packages/*/src/**`, `python/packages/**/*.py`  
**Methodology:** STRIDE + OWASP Top 10 + Secret/Pattern Scanning + Dependency Audit  
**Sources:** `/ck:security` (STRIDE analysis) + `/security-scan` (secrets, patterns, deps)  
**Files scanned:** 26 source files

---

## Summary

| Severity | Code Issues | Dep Vulnerabilities | Total |
|----------|-------------|---------------------|-------|
| Critical | 3 | 3 | **6** |
| High | 7 | 6 | **13** |
| Medium | 5 | 9 | **14** |
| Low | 3 | 1 | **4** |
| Info | 2 | — | **2** |

**.env Exposure:** ✅ Not tracked by git | ⚠️ `python/.gitignore` missing

---

## Part 1 — Code & Design Vulnerabilities

### CRITICAL

#### C-1 · Payload Size — No Input Limit Before Base64 Decode
| | |
|---|---|
| **STRIDE** | D — Denial of Service |
| **OWASP** | A04 Insecure Design |
| **Files** | `typescript/packages/core/src/middleware/middleware-core.ts:344` `python/packages/core/prism_sdk_core/__init__.py:307` |

Middleware decodes user-supplied payment header with `Buffer.from(paymentHeader, 'base64')` / `base64.b64decode()` without any size guard. Attacker sends multi-MB header → OOM / process crash.

**Fix:**
```ts
// middleware-core.ts — before Buffer.from()
if (paymentHeader.length > 65536) return null;
```
```python
# __init__.py — before b64decode
if len(payment_header) > 65536:
    raise ValueError("Payment header too large")
```

---

#### C-2 · Protocol Version Downgrade Attack
| | |
|---|---|
| **STRIDE** | S — Spoofing |
| **OWASP** | A07 Identification & Auth Failures |
| **Files** | `typescript/packages/core/src/middleware/middleware-core.ts:247-254` |

Middleware trusts `x402Version` embedded in the client-supplied payload to override the server-configured protocol version. Client can force v2→v1 downgrade to exploit v1-specific weaknesses.

```ts
// VULNERABLE — line 247-254
const payloadVersion = detectProtocolVersion(paymentPayload);
if (payloadVersion && payloadVersion !== protocolVersion) {
  protocolVersion = payloadVersion; // ← client controls this
}
```

**Fix:** Remove the override. Use `config.x402Version` or detect from HTTP header name only (not payload content).

---

#### C-3 · Hardcoded API Key in Production Module Files
| | |
|---|---|
| **STRIDE** | I — Information Disclosure |
| **OWASP** | A05 Security Misconfiguration |
| **Files (production)** | `python/packages/fastapi/prism_fastapi/__init__.py:147` `python/packages/flask/prism_flask/__init__.py:35` |
| **Files (examples)** | `typescript/examples/basic-usage.ts:9` `typescript/packages/fastify/src/index.ts:31` `typescript/packages/nestjs/src/index.ts:341` `python/packages/fastapi/examples/basic_server.py:16` `python/packages/flask/examples/basic_server.py:15` `python/packages/django/examples/demo_project/settings.py:37` |

`dev-key-123` appears in **production package source files** (not just examples), meaning the default value is shipped with the package. Any misconfigured deployment will silently use this key.

**Fix:**
```python
# prism_fastapi/__init__.py & prism_flask/__init__.py — remove default key
# Replace example docstrings with:
PrismMiddlewareConfig(api_key=os.environ['PRISM_API_KEY'])
```
```ts
// All TS examples
apiKey: process.env.PRISM_API_KEY ?? (() => { throw new Error('PRISM_API_KEY required') })()
```

---

### HIGH

#### H-1 · Host Header Injection → Resource URL Spoofing
| | |
|---|---|
| **STRIDE** | I — Information Disclosure |
| **OWASP** | A03 Injection |
| **Files** | `typescript/packages/express/src/middleware/prism-middleware.ts:45` `typescript/packages/http/src/middleware/prism-middleware.ts:91` |

`req.get('host')` / `req.headers.host` used to build `resourceUrl` forwarded to Prism Gateway. Attacker sends `Host: attacker.com` → Gateway receives spoofed resource URL.

```ts
// VULNERABLE
const resourceUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
```

**Fix:** Derive base from `config.baseUrl` or a configured `resourceBaseUrl`; only append the path from the request.

---

#### H-2 · Payment Bypass via Attribute Name Collision
| | |
|---|---|
| **STRIDE** | E — Elevation of Privilege |
| **OWASP** | A01 Broken Access Control |
| **Files** | `python/packages/django/prism_django/__init__.py:176` `python/packages/flask/prism_flask/__init__.py:156` |

`require_payment` decorator checks `hasattr(request, 'prism_payer')`. Any other middleware or test fixture that sets this attribute bypasses payment enforcement.

**Fix:** Use a typed sentinel class as the attribute value, or a unique private token:
```python
_PAYMENT_VERIFIED = object()  # module-level sentinel

# In middleware: request._prism_verified = _PAYMENT_VERIFIED
# In decorator: getattr(request, '_prism_verified', None) is not _PAYMENT_VERIFIED
```

---

#### H-3 · Internal Exception Details Leaked to HTTP Clients
| | |
|---|---|
| **STRIDE** | I — Information Disclosure |
| **OWASP** | A02 Cryptographic / Data Exposure |
| **Files** | `python/packages/core/prism_sdk_core/__init__.py:231` `:270` `typescript/packages/core/src/utils/response-builder.ts:114` |

`str(e)` / `error.message` returned in HTTP response `details` field. Stack traces, internal paths, and dependency error messages exposed to clients.

**Fix:**
```python
# __init__.py:231,270 — replace str(e) with generic message
body={'error': 'Failed to get payment requirements', 'details': 'Internal error'}
# Log actual error server-side only
```
```ts
// response-builder.ts:114 — strip details in production
details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
```

---

#### H-4 · Python Route Prefix Match Too Broad
| | |
|---|---|
| **STRIDE** | S — Spoofing |
| **OWASP** | A01 Broken Access Control |
| **Files** | `python/packages/core/prism_sdk_core/__init__.py:179-183` |

```python
# VULNERABLE — matches /api/../../admin if upstream doesn't normalize
if path.startswith(route_path):
    return config
```

Route `/api/` matches `/api/../../admin` if the framework doesn't normalize paths before middleware.

**Fix:**
```python
# Only match if next char is '/' or end-of-string
if path == route_path or path.startswith(route_path.rstrip('/') + '/'):
    return config
```

---

#### H-5 · No Structured Audit Logging for Payment Events
| | |
|---|---|
| **STRIDE** | R — Repudiation |
| **OWASP** | A09 Security Logging & Monitoring Failures |
| **Files** | `typescript/packages/core/src/middleware/middleware-core.ts:416` `python/packages/core/prism_sdk_core/__init__.py:322-335` |

Payment attempts, verifications, and settlements logged only via `console.log` / `print`. No structured format, no trace ID, no payer address or amount in logs. Cannot audit payment disputes.

**Fix:** Emit structured log events:
```ts
// Minimum audit fields per event
logger.info({ event: 'payment.verify', payer, amount, network, traceId, result: 'ok' });
```

---

#### H-6 · Debug Mode Logs Full EIP-712 Signature
| | |
|---|---|
| **STRIDE** | I — Information Disclosure |
| **OWASP** | A09 |
| **Files** | `typescript/packages/core/src/client/prism-client.ts:147-150` `:191-194` |

When `debug: true`, entire `paymentPayload` (including `payload.signature`) is logged. If debug is accidentally enabled in production, EIP-712 authorization signatures leak to log storage.

**Fix:** Redact sensitive fields before logging:
```ts
const safePayload = { ...paymentPayload, payload: { ...paymentPayload.payload, signature: '[REDACTED]' } };
console.log('[PrismClient] verifyPayment:', safePayload);
```

---

#### H-7 · Django Demo: Insecure Settings Committed to Repo
| | |
|---|---|
| **STRIDE** | I — Information Disclosure |
| **OWASP** | A05 Security Misconfiguration |
| **Files** | `python/packages/django/examples/demo_project/settings.py:10-12` |

```python
SECRET_KEY = 'django-insecure-dev-key-for-demo-only'
DEBUG = True
ALLOWED_HOSTS = ['*']
```

Tracked in git. Risk: developers copy settings to production without changing.

**Fix:**
```python
import os
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'CHANGE-ME-IN-PRODUCTION')
DEBUG = os.environ.get('DEBUG', 'false').lower() == 'true'
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost').split(',')
```

---

### MEDIUM

#### M-1 · No Axios Request Timeout
| | |
|---|---|
| **OWASP** | A04 Insecure Design |
| **Files** | `typescript/packages/core/src/client/prism-client.ts:35-41` |

`axios.create()` has no `timeout` — slow or unresponsive Gateway holds connections open indefinitely.

**Fix:** `axios.create({ baseURL, headers, timeout: 30000 })`

---

#### M-2 · No API Key Validation at Construction
| | |
|---|---|
| **OWASP** | A05 Security Misconfiguration |
| **Files** | `typescript/packages/core/src/client/prism-client.ts:27` `python/packages/core/prism_sdk_core/__init__.py:38` |

Empty string `''` accepted silently as `apiKey` / `api_key`. Requests go out with `X-API-Key: ` header; errors surface only at runtime.

**Fix:**
```ts
if (!config.apiKey?.trim()) throw new PrismConfigError('apiKey is required and cannot be empty');
```

---

#### M-3 · Default baseUrl Points to Test Environment
| | |
|---|---|
| **OWASP** | A05 Security Misconfiguration |
| **Files** | `typescript/packages/core/src/client/prism-client.ts:25` |

`DEFAULT_BASE_URL = 'https://prism-gw.test.1stdigital.tech'` — production deployments that omit `baseUrl` silently route real payments to test gateway.

**Fix:** Remove the default or throw if `baseUrl` is not explicitly provided in non-development environments.

---

#### M-4 · Price Parser Accepts Infinite / NaN Values
| | |
|---|---|
| **OWASP** | A04 Insecure Design |
| **Files** | `typescript/packages/core/src/utils/price-parser.ts:22` |

`parseFloat` can produce `Infinity` or `NaN` which propagate silently into payment requests.

**Fix:**
```ts
if (!isFinite(parsed) || parsed <= 0) throw new Error(`Invalid price value: ${price}`);
```

---

#### M-5 · FastAPI Middleware Blocks Event Loop (Sync Call in Async Context)
| | |
|---|---|
| **OWASP** | A04 Insecure Design |
| **Files** | `python/packages/fastapi/prism_fastapi/__init__.py:54` |

`self.core.handle_request()` is synchronous but called from `async dispatch()`. Under concurrent load this blocks the asyncio event loop.

**Fix:**
```python
import asyncio
result = await asyncio.get_event_loop().run_in_executor(None, self.core.handle_request, path, resource_url, payment_header, protocol_version)
```

---

### LOW

| # | File | Issue | Fix |
|---|------|-------|-----|
| L-1 | All middleware files | Debug logs full payment payload including EIP-712 signature (partial overlap with H-6) | See H-6 fix |
| L-2 | `prism-client.ts:25` | Default `baseUrl` silently routes to test env (see M-3) | See M-3 fix |
| L-3 | `python/` root | No `python/.gitignore` — `.env` files could be committed | Add `python/.gitignore` with `.env*` entries |

---

## Part 2 — Dependency Vulnerabilities

### npm audit results

```
Critical:  3  (axios, handlebars, next)
High:      6  (express, fastify, glob, minimatch, path-to-regexp, picomatch)
Moderate:  8  (@nestjs/core, @nestjs/common, ajv, brace-expansion, file-type, ...)
Low:       1  (body-parser)
```

### Critical Dependencies

| Package | CVE / Advisory | Issue | Fix |
|---------|---------------|-------|-----|
| `axios` | GHSA-43fc-jf86-j433 | DoS via `__proto__` key in `mergeConfig` | `npm update axios` |
| `axios` | GHSA-3p68-rc4w-qgx5 | SSRF via NO_PROXY hostname normalization bypass | `npm update axios` |
| `axios` | GHSA-fvcv-3m26-pcqx | Unrestricted cloud metadata exfiltration via header injection | `npm update axios` |
| `next` | GHSA-9qr9-h5gf-34mp | RCE via React flight protocol | `npm update next` |
| `next` | GHSA-ggv3-7p47-pfv8 | HTTP request smuggling in rewrites | `npm update next` |
| `next` | GHSA-h25m-26qc-wcjf | DoS via insecure React Server Components deserialization | `npm update next` |
| `handlebars` | GHSA-3mfm-83xf-c92r | JS injection via AST type confusion | Upgrade or remove |
| `handlebars` | GHSA-2w6w-674q-4c4q | Prototype pollution → XSS | Upgrade or remove |

### High Dependencies

| Package | Advisory | Issue | Fix |
|---------|---------|-------|-----|
| `fastify` | GHSA-444r-cwp2-x5xf | `request.protocol`/`host` spoofable via X-Forwarded-* | `npm update fastify` |
| `fastify` | GHSA-jx2c-rxcm-jvmq | Content-Type tab char bypasses body validation | `npm update fastify` |
| `fastify` | GHSA-mrq3-vjjr-p77c | DoS via unbounded memory in `sendWebStream` | `npm update fastify` |
| `minimatch` | GHSA-3ppc-4f35-3m26 | ReDoS via repeated wildcards | `npm update minimatch` |
| `path-to-regexp` | GHSA-37ch-88jc-xwx2 | ReDoS via multiple route params | `npm update path-to-regexp` |
| `glob` | GHSA-5j98-mcp5-4vw2 | Command injection via `-c/--cmd` with `shell:true` | `npm update glob` |
| `picomatch` | GHSA-3v7f-55p6-f55p | Method injection in POSIX character classes | `npm update picomatch` |
| `@nestjs/core` | GHSA-36xv-jgw5-4q75 | Injection via improper output neutralization (≤11.1.17) | Upgrade to ≥11.1.19 |

---

## .env Exposure Check

```
✅ .env files not tracked by git
✅ typescript/.gitignore includes: .env, .env.local, .env.*.local
⚠️  python/.gitignore does not exist — .env files at risk of accidental commit
```

---

## Priority Fix Order

### Immediate — Block Release
| # | Action |
|---|--------|
| C-1 | Add 64KB size guard before base64 decode in TS + Python middleware |
| C-2 | Remove protocol version override from client payload |
| C-3 | Remove hardcoded `dev-key-123` from `prism_fastapi/__init__.py` and `prism_flask/__init__.py` |
| H-1 | Fix Host header injection in resource URL construction |
| H-3 | Stop exposing `str(e)` / `error.message` in HTTP responses |
| Dep | `npm update axios next` |

### This Sprint
| # | Action |
|---|--------|
| H-2 | Harden `require_payment` decorator with typed sentinel |
| H-4 | Fix Python prefix route match (`startswith` → segment match) |
| H-6 | Redact EIP-712 signature in debug logs |
| H-7 | Load Django demo settings from env vars |
| M-1 | Add `timeout: 30000` to Axios client |
| M-3 | Remove/warn on default test `baseUrl` |
| Dep | `npm update fastify minimatch path-to-regexp @nestjs/core` |

### Next Sprint
| # | Action |
|---|--------|
| H-5 | Implement structured audit logging with trace IDs |
| M-2 | Add `apiKey` validation at constructor |
| M-4 | Validate price is finite and > 0 |
| M-5 | Wrap FastAPI sync core call in `run_in_executor` |
| L-3 | Add `python/.gitignore` |

---

## Unresolved Questions

1. Is `handlebars` used at **runtime** or only in devDependencies? If dev-only, Critical dep finding is lower priority.
2. Are `next` and `fastify` production dependencies or only peer/optional deps in their respective framework packages?
3. Is there a WAF or reverse proxy with rate limiting upstream? If yes, C-1 (DoS via large payload) risk reduces.
4. Does the Prism Gateway validate `resourceUrl` against a registered allowlist? If yes, H-1 (Host header injection) impact reduces.
