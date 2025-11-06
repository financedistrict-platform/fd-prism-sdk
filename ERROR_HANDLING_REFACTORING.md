# Error Handling Refactoring Plan

## Overview

Implement structured error handling in Prism SDK to provide better error messages, preserve HTTP status codes, and enable programmatic error handling for SDK users.

## Current Problems

### 1. Generic Error Messages

```typescript
catch (error) {
  console.error('Error generating payment requirements:', error);
  return res.status(500).json({
    error: 'Failed to generate payment requirements',  // ← Too generic!
  });
}
```

**Issues:**

- ❌ User sees only generic message
- ❌ Can't distinguish between different error types (API key invalid, network timeout, gateway down)
- ❌ No debugging information (trace IDs, timestamps)
- ❌ Always returns 500 even for 400/401/403 errors

### 2. Lost Original Error Details

```json
// Gateway returns:
{
  "status": 500,
  "detail": "42703: column p.ProviderId does not exist",
  "errorCode": "INTERNAL_ERROR",
  "traceId": "0HNGT483NH6I8:00000001",
  "timestamp": "2025-11-06T13:13:00Z"
}

// SDK returns:
{
  "error": "Failed to generate payment requirements"  // ← Lost all details!
}
```

---

## Solution Architecture

### 1. Create Error Type Hierarchy

**File:** `packages/core/src/types/errors.ts` (NEW)

````typescript
/**
 * Base error class for all Prism SDK errors
 */
export class PrismError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: any
  ) {
    super(message);
    this.name = "PrismError";

    // Maintain proper stack trace (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for API responses
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

/**
 * Gateway returned an error (4xx, 5xx from Prism Gateway API)
 *
 * @example
 * ```typescript
 * if (error instanceof PrismGatewayError) {
 *   console.log(`Gateway error: ${error.traceId}`);
 *   // Escalate to backend team if 500
 * }
 * ```
 */
export class PrismGatewayError extends PrismError {
  constructor(
    message: string,
    statusCode: number,
    public readonly traceId?: string,
    public readonly timestamp?: string,
    details?: any
  ) {
    super(message, "GATEWAY_ERROR", statusCode, details);
    this.name = "PrismGatewayError";
  }

  toJSON() {
    return {
      ...super.toJSON(),
      traceId: this.traceId,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Network/timeout issues (connection refused, DNS errors, timeout)
 *
 * @example
 * ```typescript
 * if (error instanceof PrismNetworkError) {
 *   // Retry or show "service unavailable" message
 * }
 * ```
 */
export class PrismNetworkError extends PrismError {
  constructor(message: string, public readonly originalError: any) {
    super(message, "NETWORK_ERROR", 503, originalError);
    this.name = "PrismNetworkError";
  }
}

/**
 * Invalid configuration (missing API key, invalid base URL, etc.)
 *
 * @example
 * ```typescript
 * if (error instanceof PrismConfigError) {
 *   // Developer error - check configuration
 * }
 * ```
 */
export class PrismConfigError extends PrismError {
  constructor(message: string, details?: any) {
    super(message, "CONFIG_ERROR", 500, details);
    this.name = "PrismConfigError";
  }
}

/**
 * Invalid payment header/payload
 *
 * @example
 * ```typescript
 * if (error instanceof PrismPaymentError) {
 *   // Invalid payment from client
 *   return res.status(402).json({ error: error.message });
 * }
 * ```
 */
export class PrismPaymentError extends PrismError {
  constructor(message: string, details?: any) {
    super(message, "PAYMENT_ERROR", 402, details);
    this.name = "PrismPaymentError";
  }
}

/**
 * Validation error (invalid request data)
 */
export class PrismValidationError extends PrismError {
  constructor(message: string, public readonly field?: string, details?: any) {
    super(message, "VALIDATION_ERROR", 400, details);
    this.name = "PrismValidationError";
  }
}
````

---

### 2. Update PrismClient Error Handling

**File:** `packages/core/src/client/prism-client.ts`

**Changes:**

```typescript
import {
  PrismError,
  PrismGatewayError,
  PrismNetworkError,
  PrismConfigError,
  PrismValidationError,
} from "../types/errors";

export class PrismClient {
  // ... existing code ...

  /**
   * Handle Axios errors and convert to structured Prism errors
   */
  private handleError(error: any, context: string): never {
    // Axios error with response from server (4xx, 5xx)
    if (error.response) {
      const { status, data } = error.response;

      // Extract error details from RFC 7807 Problem Details format
      const message = data.title || data.error || `${context} failed`;
      const details = data.detail;
      const traceId = data.traceId;
      const timestamp = data.timestamp;

      throw new PrismGatewayError(message, status, traceId, timestamp, details);
    }

    // Network error (timeout, connection refused, DNS error, etc.)
    if (error.request) {
      throw new PrismNetworkError(
        `Failed to reach Prism Gateway: ${error.message}`,
        error
      );
    }

    // Request setup error (invalid config, etc.)
    if (
      error.code === "ERR_BAD_OPTION_VALUE" ||
      error.code === "ERR_BAD_OPTION"
    ) {
      throw new PrismConfigError(
        `Invalid Prism client configuration: ${error.message}`,
        error
      );
    }

    // Unknown error
    throw new PrismError(
      error.message || `${context} failed`,
      "UNKNOWN_ERROR",
      500,
      error
    );
  }

  async getPaymentRequirements(
    request: PaymentRequirementsRequest
  ): Promise<PaymentRequirementsResponse> {
    try {
      const response =
        await this.axiosInstance.post<PaymentRequirementsResponse>(
          "/api/v1/payment/requirements",
          request
        );
      return response.data;
    } catch (error: any) {
      this.handleError(error, "Get payment requirements");
    }
  }

  async verifyPayment(paymentHeader: string): Promise<VerificationResult> {
    try {
      const response = await this.axiosInstance.post<VerificationResult>(
        "/api/v1/payment/verify",
        { paymentHeader }
      );
      return response.data;
    } catch (error: any) {
      this.handleError(error, "Verify payment");
    }
  }

  async settlePayment(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<SettlementResponse> {
    try {
      const response = await this.axiosInstance.post<SettlementResponse>(
        "/api/v1/payment/settle",
        { paymentPayload, paymentRequirements }
      );
      return response.data;
    } catch (error: any) {
      this.handleError(error, "Settle payment");
    }
  }
}
```

---

### 3. Update Express Middleware Error Handling

**File:** `packages/express/src/middleware/prism-middleware.ts`

**Changes:**

```typescript
import {
  PrismGatewayError,
  PrismNetworkError,
  PrismConfigError,
  PrismPaymentError,
  PrismError,
} from "@1stdigital/prism-core";

export function prismPaymentMiddleware(
  config: PrismMiddlewareConfig,
  routes: RoutesConfig
) {
  const client = new PrismClient(config);

  return async function (req: Request, res: Response, next: NextFunction) {
    // ... existing route matching code ...

    if (!paymentHeader) {
      // No payment provided, return 402 with payment requirements
      try {
        // ... existing payment requirements generation code ...

        const paymentRequirements = await client.getPaymentRequirements(
          request
        );

        return res.status(402).json(paymentRequirements);
      } catch (error: any) {
        console.error("Error generating payment requirements:", error);

        // Handle PrismGatewayError (preserve status code and details)
        if (error instanceof PrismGatewayError) {
          return res.status(error.statusCode).json({
            x402Version: 1,
            error: error.message,
            details: error.details,
            gateway: {
              traceId: error.traceId,
              timestamp: error.timestamp,
            },
          });
        }

        // Handle PrismNetworkError (service unavailable)
        if (error instanceof PrismNetworkError) {
          return res.status(503).json({
            x402Version: 1,
            error: "Payment service unavailable",
            details:
              "Could not connect to Prism Gateway. Please try again later.",
            retryAfter: 60, // seconds
          });
        }

        // Handle PrismConfigError (server misconfiguration)
        if (error instanceof PrismConfigError) {
          return res.status(500).json({
            x402Version: 1,
            error: "Payment service misconfigured",
            details: "Please contact the administrator.",
          });
        }

        // Unknown error - generic 500
        return res.status(500).json({
          x402Version: 1,
          error: "Failed to generate payment requirements",
          details: error.message || "An unexpected error occurred",
        });
      }
    }

    // Payment header exists, verify and settle payment
    try {
      // ... existing payment verification/settlement code ...
    } catch (error: any) {
      console.error("Error processing payment:", error);

      // Similar error handling as above
      if (error instanceof PrismPaymentError) {
        return res.status(402).json({
          x402Version: 1,
          error: error.message,
          details: error.details,
        });
      }

      if (error instanceof PrismGatewayError) {
        return res.status(error.statusCode).json({
          x402Version: 1,
          error: "Payment processing failed",
          details: error.details,
          gateway: {
            traceId: error.traceId,
            timestamp: error.timestamp,
          },
        });
      }

      return res.status(500).json({
        x402Version: 1,
        error: "Failed to process payment",
        details: error.message,
      });
    }
  };
}
```

---

### 4. Export Error Classes from Core

**File:** `packages/core/src/index.ts`

**Add exports:**

```typescript
// Export error classes for users who want to catch specific types
export {
  PrismError,
  PrismGatewayError,
  PrismNetworkError,
  PrismConfigError,
  PrismPaymentError,
  PrismValidationError,
} from "./types/errors";

// Export existing types
export type {
  PrismMiddlewareConfig,
  // ... other types
} from "./types";
```

---

### 5. Update Type Definitions

**File:** `packages/core/src/types/index.ts`

**Add error response interfaces:**

```typescript
/**
 * Standard error response format
 */
export interface PrismErrorResponse {
  x402Version: number;
  error: string;
  details?: string;
  gateway?: {
    traceId?: string;
    timestamp?: string;
  };
  retryAfter?: number; // for 503 errors
}
```

---

## Usage Examples

### For SDK Users

#### 1. Basic Error Handling

```typescript
import { prismPaymentMiddleware } from "@1stdigital/prism-express";
import { PrismGatewayError, PrismNetworkError } from "@1stdigital/prism-core";

app.use(prismPaymentMiddleware(config, routes));

// Custom error handler
app.use((err, req, res, next) => {
  if (err instanceof PrismGatewayError) {
    // Log to monitoring service with trace ID
    logger.error("Prism Gateway Error", {
      traceId: err.traceId,
      statusCode: err.statusCode,
      details: err.details,
      endpoint: req.path,
    });

    // Alert if 500 error from gateway
    if (err.statusCode >= 500) {
      alerting.send("Prism Gateway internal error", {
        traceId: err.traceId,
      });
    }
  }

  if (err instanceof PrismNetworkError) {
    // Alert ops team - gateway is down
    alerting.critical("Prism Gateway is unreachable");
  }

  next(err);
});
```

#### 2. Retry Logic

```typescript
import {
  PrismClient,
  PrismNetworkError,
  PrismGatewayError,
} from "@1stdigital/prism-core";

async function getPaymentRequirementsWithRetry(
  client,
  request,
  maxRetries = 3
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.getPaymentRequirements(request);
    } catch (error) {
      // Retry on network errors
      if (error instanceof PrismNetworkError) {
        console.log(`Network error, retrying (${i + 1}/${maxRetries})...`);
        await sleep(1000 * Math.pow(2, i)); // Exponential backoff
        continue;
      }

      // Don't retry on 4xx errors (client errors)
      if (error instanceof PrismGatewayError && error.statusCode < 500) {
        throw error;
      }

      // Retry on 5xx errors
      if (error instanceof PrismGatewayError && i < maxRetries - 1) {
        console.log(`Gateway error ${error.statusCode}, retrying...`);
        await sleep(1000 * Math.pow(2, i));
        continue;
      }

      throw error;
    }
  }
}
```

#### 3. User-Friendly Error Messages

```typescript
app.use((err, req, res, next) => {
  if (err instanceof PrismGatewayError) {
    // Map gateway errors to user-friendly messages
    const userMessage =
      {
        401: "Payment service authentication failed. Please contact support.",
        403: "Access denied to payment service.",
        404: "Payment resource not found.",
        500: "Payment service is experiencing issues. Please try again later.",
        503: "Payment service is temporarily unavailable.",
      }[err.statusCode] || "Payment processing failed.";

    return res.status(err.statusCode).json({
      error: userMessage,
      supportInfo: {
        traceId: err.traceId,
        timestamp: err.timestamp,
      },
    });
  }

  next(err);
});
```

---

## Error Response Examples

### Before (Current Implementation)

**Request:**

```bash
GET /api/premium
```

**Response (500):**

```json
{
  "error": "Failed to generate payment requirements"
}
```

❌ No status code differentiation  
❌ No details  
❌ No debugging info

---

### After (Improved Implementation)

#### Scenario 1: Gateway Database Error (500)

**Response (500):**

```json
{
  "x402Version": 1,
  "error": "Internal Error",
  "details": "42703: column p.ProviderId does not exist\n\nPOSITION: 74",
  "gateway": {
    "traceId": "0HNGT483NH6I8:00000001",
    "timestamp": "2025-11-06T13:13:00.2646107Z"
  }
}
```

✅ Preserves 500 status  
✅ Includes database error details  
✅ Trace ID for backend correlation  
✅ Timestamp for log searching

#### Scenario 2: Invalid API Key (401)

**Response (401):**

```json
{
  "x402Version": 1,
  "error": "Unauthorized",
  "details": "Invalid or expired API key",
  "gateway": {
    "traceId": "0HNGT483NH6I9:00000002",
    "timestamp": "2025-11-06T13:15:00Z"
  }
}
```

✅ Correct 401 status (not 500)  
✅ Clear reason

#### Scenario 3: Network Timeout (503)

**Response (503):**

```json
{
  "x402Version": 1,
  "error": "Payment service unavailable",
  "details": "Could not connect to Prism Gateway. Please try again later.",
  "retryAfter": 60
}
```

✅ Service unavailable (not 500)  
✅ Retry hint for clients

#### Scenario 4: Invalid Request Data (400)

**Response (400):**

```json
{
  "x402Version": 1,
  "error": "Bad Request",
  "details": "requestedAmount must be a positive number",
  "gateway": {
    "traceId": "0HNGT483NH6I10:00000003",
    "timestamp": "2025-11-06T13:20:00Z"
  }
}
```

✅ Validation error (not 500)  
✅ Specific field information

---

## Implementation Checklist

- [x] 1. Create `packages/core/src/types/errors.ts` with error classes
- [x] 2. Update `packages/core/src/types/index.ts` to export error response interface
- [x] 3. Update `packages/core/src/client/prism-client.ts` to use structured errors
- [x] 4. Update `packages/core/src/index.ts` to export error classes
- [x] 5. Update `packages/express/src/middleware/prism-middleware.ts` error handling (2 places)
- [x] 6. Build and test core package
- [x] 7. Build and test express package
- [ ] 8. Update documentation with error handling examples
- [ ] 9. Bump versions (core: 1.0.4 → 1.1.0, express: 1.0.2 → 1.1.0)
- [ ] 10. Publish updated packages

## Implementation Status

✅ **COMPLETED** - Error handling refactoring implemented successfully!

**Build Results:**

```
• Packages in scope: @1stdigital/prism-core, @1stdigital/prism-express,
  @1stdigital/prism-fastify, @1stdigital/prism-nestjs, @1stdigital/prism-nextjs
• Running build in 5 packages
 Tasks:    5 successful, 5 total
  Time:    31.158s
```

**Changes Made:**

1. ✅ Created 6 error classes in `core/src/types/errors.ts`
2. ✅ Added `handleError()` method to PrismClient
3. ✅ Updated all PrismClient methods to use structured error handling
4. ✅ Updated Express middleware with specific error handlers (2 catch blocks)
5. ✅ Exported error classes from core package
6. ✅ Added PrismErrorResponse interface

**Next Steps:**

- Update TypeScript SDK documentation with error handling examples
- Bump package versions (minor version bump: 1.x.x → 1.1.0)
- Publish to GitHub Packages
- Test with real Gateway responses

---

## Benefits Summary

### For End Users (API Consumers)

✅ **Better error messages** - Know what went wrong  
✅ **Correct HTTP status codes** - Can handle 401, 503 differently  
✅ **Retry hints** - `retryAfter` for temporary failures  
✅ **Support information** - Trace IDs for contacting support

### For SDK Users (Developers)

✅ **Type-safe error handling** - `instanceof` checks  
✅ **Programmatic error handling** - Retry logic, alerting  
✅ **Better debugging** - Full error details preserved  
✅ **Monitoring integration** - Trace IDs, timestamps

### For Backend Team

✅ **Error correlation** - Trace IDs link SDK errors to gateway logs  
✅ **Better diagnostics** - See exact error from gateway  
✅ **Incident response** - Quickly identify if issue is gateway or network

---

## Version Strategy

This is a **minor version bump** (1.0.x → 1.1.0):

- ✅ Backward compatible (existing code still works)
- ✅ Adds new features (error classes)
- ✅ Improves existing functionality (error handling)
- ❌ No breaking changes

Users can upgrade safely without code changes, but can optionally use new error classes for better handling.
