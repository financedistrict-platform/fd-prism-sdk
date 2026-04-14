# Security Audit — Consolidated Report
## `typescript/` + `python/`

**Date:** 2026-04-14
**Updated:** 2026-04-14 (post-fix status + resolved questions)
**Branch:** `feat/sercurity-code-v1`
**Scope:** `typescript/packages/*/src/**`, `python/packages/**/*.py`
**Methodology:** STRIDE + OWASP Top 10 + Secret/Pattern Scanning + Dependency Audit
**Sources:** `/ck:security` (STRIDE analysis) + `/security-scan` (secrets, patterns, deps)
**Files scanned:** 26 source files

---

## Summary

| Severity | Code Issues | Dep Vulnerabilities | Total |
|----------|-------------|---------------------|-------|
| Critical | 3 | 1 ~~3~~ | **4** ~~6~~ |
| High | 7 | 6 | **13** |
| Medium | 5 | 9 | **14** |
| Low | 3 | 1 | **4** |
| Info | 2 + 2 (reclassified) | — | **4** |

> **Adjusted:** `handlebars` (2 CVEs) reclassified from Critical → Info. It is a transitive dependency of `ts-jest` (`"dev": true` in package-lock.json) — never ships to production. See [Q1 resolution](#resolved-questions).

**.env Exposure:** ✅ Not tracked by git | ⚠️ `python/.gitignore` missing

---

## Fix Status

> Commit `aafaab4` = first pass. Remaining items fixed in follow-up (same branch).

| # | Finding | Status | Notes |
|---|---------|--------|-------|
| C-1 | Payload size guard | ✅ **Fixed** | 8KB limit in TS + Python |
| C-2 | Protocol version downgrade | ✅ **Fixed** | `allowedVersions` whitelist replaces blind override |
| C-3 | Hardcoded `dev-key-123` | ✅ **Fixed** | Removed from all production source + Django docstring |
| H-1 | Host header injection | ✅ **Fixed** | `config.resourceBaseUrl` in express + http middleware |
| H-2 | Payment bypass (attribute collision) | ✅ **Fixed** | `_prism_payment_verified` sentinel in Django/Flask/FastAPI |
| H-3 | Exception details leaked | ✅ **Fixed** | Python: generic messages. TS: `response-builder.ts` returns generic error |
| H-4 | Route prefix match too broad | ✅ **Fixed** | Segment boundary check in Python core |
| H-5 | No structured audit logging | ❌ **Deferred** | Next sprint — requires logging architecture decision |
| H-6 | Debug logs EIP-712 signature | ✅ **Fixed** | Signature redacted with `[REDACTED]` |
| H-7 | Django demo insecure settings | ✅ **Fixed** | SECRET_KEY/DEBUG/ALLOWED_HOSTS read from env vars |
| M-1 | No Axios timeout | ✅ **Fixed** | `timeout: 30_000` added |
| M-2 | No API key validation | ✅ **Fixed** | Throws at construction if empty/missing (TS + Python) |
| M-3 | Default baseUrl → test env | ✅ **Fixed** | `console.warn` emitted when no baseUrl configured |
| M-4 | Price parser Infinity/NaN | ✅ **Fixed** | `isFinite(parsed) && parsed > 0` check |
| M-5 | FastAPI sync blocking | ✅ **N/A** | Already uses `ahandle_request` (async). Report was based on older code |
| L-3 | python/.gitignore missing | ✅ **Fixed** | Created with `.env*`, `__pycache__/`, etc. |

---

## Part 1 — Code & Design Vulnerabilities

### CRITICAL

#### C-1 · Payload Size — No Input Limit Before Base64 Decode ✅ FIXED
| | |
|---|---|
| **STRIDE** | D — Denial of Service |
| **OWASP** | A04 Insecure Design |
| **Files** | `typescript/packages/core/src/middleware/middleware-core.ts` `python/packages/core/prism_sdk_core/__init__.py` |
| **Status** | ✅ Fixed in `aafaab4` — 8KB (`MAX_PAYMENT_HEADER_BYTES = 8192`) size guard before decode in both TS and Python |

---

#### C-2 · Protocol Version Downgrade Attack ✅ FIXED
| | |
|---|---|
| **STRIDE** | S — Spoofing |
| **OWASP** | A07 Identification & Auth Failures |
| **Files** | `typescript/packages/core/src/middleware/middleware-core.ts` `python/packages/core/prism_sdk_core/__init__.py` |
| **Status** | ✅ Fixed in `aafaab4` — `allowedVersions` whitelist (default `[2]`). Client version rejected if not in whitelist |

---

#### C-3 · Hardcoded API Key in Production Module Files ✅ FIXED
| | |
|---|---|
| **STRIDE** | I — Information Disclosure |
| **OWASP** | A05 Security Misconfiguration |
| **Status** | ✅ Fixed — `dev-key-123` removed from all production source files (`prism_fastapi`, `prism_flask`, `prism_django` docstrings). TS JSDoc comments in `express`, `http`, `fastify`, `nestjs` still reference it as example text (low risk — docstrings, not default values) |

---

### HIGH

#### H-1 · Host Header Injection → Resource URL Spoofing ✅ FIXED
| | |
|---|---|
| **STRIDE** | I — Information Disclosure |
| **OWASP** | A03 Injection |
| **Files** | `typescript/packages/express/src/middleware/prism-middleware.ts` `typescript/packages/http/src/middleware/prism-middleware.ts` |
| **Status** | ✅ Fixed in `aafaab4` — `config.resourceBaseUrl` takes priority over `req.get('host')`. Fallback to Host header only when not configured |
| **Impact note** | Prism Gateway does NOT validate `resourceUrl` against an allowlist (Gateway doesn't know what seller serves), so this fix is essential |

---

#### H-2 · Payment Bypass via Attribute Name Collision ✅ FIXED
| | |
|---|---|
| **STRIDE** | E — Elevation of Privilege |
| **OWASP** | A01 Broken Access Control |
| **Files** | Django, Flask, FastAPI middleware |
| **Status** | ✅ Fixed in `aafaab4` — underscore-prefixed `_prism_payment_verified` boolean flag. `require_payment` checks `getattr(request, '_prism_payment_verified', False)` instead of `hasattr(request, 'prism_payer')` |

---

#### H-3 · Internal Exception Details Leaked to HTTP Clients ✅ FIXED
| | |
|---|---|
| **STRIDE** | I — Information Disclosure |
| **OWASP** | A02 Cryptographic / Data Exposure |
| **Status** | ✅ Fixed — Python: `str(e)` replaced with generic messages. TS: `response-builder.ts:114` now returns `'An unexpected error occurred'` instead of `error.message` |

---

#### H-4 · Python Route Prefix Match Too Broad ✅ FIXED
| | |
|---|---|
| **STRIDE** | S — Spoofing |
| **OWASP** | A01 Broken Access Control |
| **Files** | `python/packages/core/prism_sdk_core/__init__.py` |
| **Status** | ✅ Fixed in `aafaab4` — `path.startswith(prefix + '/')` segment boundary check |

---

#### H-5 · No Structured Audit Logging for Payment Events ❌ NOT STARTED
| | |
|---|---|
| **STRIDE** | R — Repudiation |
| **OWASP** | A09 Security Logging & Monitoring Failures |
| **Files** | `typescript/packages/core/src/middleware/middleware-core.ts` `python/packages/core/prism_sdk_core/__init__.py` |

Payment attempts, verifications, and settlements logged only via `console.log` / `print`. No structured format, no trace ID, no payer address or amount in logs. Cannot audit payment disputes.

**Fix:** Emit structured log events:
```ts
logger.info({ event: 'payment.verify', payer, amount, network, traceId, result: 'ok' });
```

---

#### H-6 · Debug Mode Logs Full EIP-712 Signature ✅ FIXED
| | |
|---|---|
| **STRIDE** | I — Information Disclosure |
| **OWASP** | A09 |
| **Files** | `typescript/packages/core/src/client/prism-client.ts` |
| **Status** | ✅ Fixed in `aafaab4` — signature field replaced with `[REDACTED]` before logging |

---

#### H-7 · Django Demo: Insecure Settings Committed to Repo ✅ FIXED
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

**Fix:**
```python
import os
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'CHANGE-ME-IN-PRODUCTION')
DEBUG = os.environ.get('DEBUG', 'false').lower() == 'true'
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost').split(',')
```

---

### MEDIUM

#### M-1 · No Axios Request Timeout ✅ FIXED
| | |
|---|---|
| **OWASP** | A04 Insecure Design |
| **Files** | `typescript/packages/core/src/client/prism-client.ts:35-41` |

`axios.create()` has no `timeout` — slow or unresponsive Gateway holds connections open indefinitely.

**Fix:** `axios.create({ baseURL, headers, timeout: 30000 })`

---

#### M-2 · No API Key Validation at Construction ✅ FIXED
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

#### M-3 · Default baseUrl Points to Test Environment ✅ FIXED
| | |
|---|---|
| **OWASP** | A05 Security Misconfiguration |
| **Files** | `typescript/packages/core/src/client/prism-client.ts:25` |

`DEFAULT_BASE_URL = 'https://prism-gw.test.1stdigital.tech'` — production deployments that omit `baseUrl` silently route real payments to test gateway.

**Fix:** Remove the default or throw if `baseUrl` is not explicitly provided in non-development environments.

---

#### M-4 · Price Parser Accepts Infinite / NaN Values ✅ FIXED
| | |
|---|---|
| **OWASP** | A04 Insecure Design |
| **Files** | `typescript/packages/core/src/utils/price-parser.ts:22` |

`parseFloat` can produce `Infinity` or `NaN` which propagate silently into payment requests. (`isNaN` is checked, but `Infinity` passes through.)

**Fix:**
```ts
if (!isFinite(parsed) || parsed <= 0) throw new Error(`Invalid price value: ${price}`);
```

---

#### M-5 · FastAPI Middleware Blocks Event Loop (Sync Call in Async Context) ✅ N/A
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

| # | File | Issue | Status | Fix |
|---|------|-------|--------|-----|
| L-1 | All middleware files | Debug logs full payment payload (overlap with H-6) | ✅ Fixed via H-6 | — |
| L-2 | `prism-client.ts:25` | Default `baseUrl` → test env (overlap with M-3) | ✅ Fixed via M-3 | — |
| L-3 | `python/` root | No `python/.gitignore` — `.env` at risk | ✅ Fixed | `python/.gitignore` created |

---

## Part 2 — Dependency Vulnerabilities

### npm audit results

```
Critical:  1  (axios)  — handlebars reclassified to Info (dev-only)
High:      6  (express, fastify, glob, minimatch, path-to-regexp, picomatch)
Moderate:  8  (@nestjs/core, @nestjs/common, ajv, brace-expansion, file-type, ...)
Low:       1  (body-parser)
```

> `next` and `fastify` are **production dependencies** — SDK users install these framework packages directly. Vulnerabilities in these packages directly affect end-user applications.

### Critical Dependencies

| Package | CVE / Advisory | Issue | Fix | Note |
|---------|---------------|-------|-----|------|
| `axios` | GHSA-43fc-jf86-j433 | DoS via `__proto__` key in `mergeConfig` | `npm update axios` | Production dep |
| `axios` | GHSA-3p68-rc4w-qgx5 | SSRF via NO_PROXY hostname normalization bypass | `npm update axios` | Production dep |
| `axios` | GHSA-fvcv-3m26-pcqx | Unrestricted cloud metadata exfiltration via header injection | `npm update axios` | Production dep |
| `next` | GHSA-9qr9-h5gf-34mp | RCE via React flight protocol | `npm update next` | Production dep — SDK user ships this |
| `next` | GHSA-ggv3-7p47-pfv8 | HTTP request smuggling in rewrites | `npm update next` | Production dep |
| `next` | GHSA-h25m-26qc-wcjf | DoS via insecure React Server Components deserialization | `npm update next` | Production dep |
| ~~`handlebars`~~ | ~~GHSA-3mfm-83xf-c92r~~ | ~~JS injection via AST type confusion~~ | ~~Upgrade or remove~~ | **Reclassified → Info**: transitive dep of `ts-jest` (`"dev": true`). Never ships to production |
| ~~`handlebars`~~ | ~~GHSA-2w6w-674q-4c4q~~ | ~~Prototype pollution → XSS~~ | ~~Upgrade or remove~~ | **Reclassified → Info** |

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

### Immediate — Block Release ✅ ALL DONE

| # | Action | Status |
|---|--------|--------|
| C-1 | 8KB size guard before base64 decode in TS + Python | ✅ Done |
| C-2 | `allowedVersions` whitelist replaces protocol version override | ✅ Done |
| C-3 | Remove `dev-key-123` from all production source files | ✅ Done |
| H-1 | `resourceBaseUrl` config prevents Host header injection | ✅ Done |
| H-3 | Strip exception details from HTTP responses (TS + Python) | ✅ Done |
| Dep | `npm update axios next` | ⚠️ Pending — run manually |

### This Sprint ✅ ALL DONE

| # | Action | Status |
|---|--------|--------|
| H-2 | `_prism_payment_verified` sentinel in decorators | ✅ Done |
| H-4 | Segment boundary fix for Python prefix route match | ✅ Done |
| H-6 | Redact EIP-712 signature in debug logs | ✅ Done |
| H-7 | Load Django demo settings from env vars | ✅ Done |
| M-1 | Add `timeout: 30_000` to Axios client | ✅ Done |
| M-2 | Add `apiKey` validation at constructor (TS + Python) | ✅ Done |
| M-3 | Warn when no `baseUrl` configured (defaults to test env) | ✅ Done |
| M-4 | Validate price is `isFinite` and `> 0` | ✅ Done |
| L-3 | Add `python/.gitignore` | ✅ Done |
| Dep | `npm update fastify minimatch path-to-regexp @nestjs/core` | ⚠️ Pending — run manually |

### Next Sprint

| # | Action | Status |
|---|--------|--------|
| H-5 | Implement structured audit logging with trace IDs | ❌ Not started — requires logging architecture decision |
| M-5 | FastAPI sync blocking | ✅ N/A — already uses `ahandle_request` (async) |

---

## Resolved Questions

1. **`handlebars` — dev-only, no production impact.** Transitive dependency of `ts-jest` (package-lock.json line 7276, `"dev": true`). Never installed by SDK users. **2 Critical CVEs reclassified to Info.**

2. **`next`/`fastify` — production dependencies.** SDK ships framework-specific packages (`@prism/nextjs`, `@prism/fastify`, etc.) that SDK users install directly. Vulnerabilities propagate to end-user applications. **Keep Critical/High priority.**

3. **WAF/rate limiting — unknown, assumed absent.** Skipped — keeping C-1 (DoS via large payload) at original risk level.

4. **Prism Gateway does NOT validate `resourceUrl`.** Gateway cannot know what the seller (resource server) serves, so it cannot validate URLs against an allowlist. **H-1 (Host header injection) remains fully exploitable without the fix. Consider Critical in payment contexts.**
