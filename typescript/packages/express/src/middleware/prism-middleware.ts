import { Request, Response, NextFunction } from 'express';
import {
  PrismMiddlewareCore,
  PrismMiddlewareConfig,
  RoutesConfig,
  HeaderAdapter,
  detectProtocolVersion,
} from '@financedistrict/prism-x402-sdk';

interface SettlementRejection {
  status: number;
  body: Record<string, unknown>;
}

const BODY_DESCRIBING_HEADERS = [
  'content-length',
  'content-encoding',
  'content-disposition',
  'content-range',
  'content-language',
  'accept-ranges',
  'etag',
  'last-modified',
  'transfer-encoding',
];

function toBuffer(chunk: unknown, encoding?: BufferEncoding): Buffer {
  if (typeof chunk === 'string') {
    return Buffer.from(chunk, encoding);
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }
  throw new TypeError('The "chunk" argument must be of type string or an instance of Buffer or Uint8Array');
}

function encodingOf(value: unknown): BufferEncoding | undefined {
  return typeof value === 'string' ? (value as BufferEncoding) : undefined;
}

function applyHeaders(res: Response, headers: unknown): void {
  if (!headers) {
    return;
  }
  if (Array.isArray(headers)) {
    const pairs: Array<[string, any]> = Array.isArray(headers[0])
      ? (headers as Array<[string, any]>)
      : Array.from({ length: Math.floor(headers.length / 2) }, (_, i): [string, any] => [
          headers[2 * i],
          headers[2 * i + 1],
        ]);
    pairs.forEach(([name, value]) => res.setHeader(name, value));
    return;
  }
  Object.entries(headers as Record<string, any>).forEach(([name, value]) => {
    if (value !== undefined) {
      res.setHeader(name, value);
    }
  });
}

function holdResponseUntilSettled(
  res: Response,
  settle: () => Promise<SettlementRejection | null>
): void {
  const originalWrite = res.write.bind(res) as (...args: any[]) => boolean;
  const originalEnd = res.end.bind(res) as (...args: any[]) => Response;
  const originalWriteHead = res.writeHead.bind(res) as (...args: any[]) => Response;
  const originalFlushHeaders = res.flushHeaders.bind(res);
  const held: Buffer[] = [];
  let released = false;
  let ending = false;

  res.writeHead = function (statusCode: number, reasonOrHeaders?: any, headers?: any) {
    if (released) {
      return originalWriteHead(statusCode, reasonOrHeaders, headers);
    }
    res.statusCode = statusCode;
    if (typeof reasonOrHeaders === 'string') {
      res.statusMessage = reasonOrHeaders;
      applyHeaders(res, headers);
    } else {
      applyHeaders(res, reasonOrHeaders);
    }
    return res;
  } as any;

  res.flushHeaders = function () {
    if (released) {
      originalFlushHeaders();
    }
  };

  res.write = function (chunk: any, encodingOrCallback?: any, callback?: any): boolean {
    if (released) {
      return originalWrite(chunk, encodingOrCallback, callback);
    }
    const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    if (ending) {
      if (typeof done === 'function') {
        process.nextTick(done, new Error('write after end'));
      }
      return false;
    }
    held.push(toBuffer(chunk, encodingOf(encodingOrCallback)));
    if (typeof done === 'function') {
      process.nextTick(done);
    }
    return true;
  } as any;

  const finish = async (done?: () => void): Promise<void> => {
    const rejection = await settle();
    released = true;

    if (rejection) {
      held.length = 0;
      BODY_DESCRIBING_HEADERS.forEach((name) => res.removeHeader(name));
      if (!res.headersSent) {
        res.status(rejection.status);
        res.setHeader('Content-Type', 'application/json');
      }
      originalEnd(JSON.stringify(rejection.body), done);
      return;
    }

    held.forEach((part) => originalWrite(part));
    held.length = 0;
    originalEnd(done);
  };

  res.end = function (chunk?: any, encodingOrCallback?: any, callback?: any): Response {
    if (released) {
      return originalEnd(chunk, encodingOrCallback, callback);
    }
    if (ending) {
      return res;
    }

    const done = [chunk, encodingOrCallback, callback].find((arg) => typeof arg === 'function');
    if (chunk !== undefined && chunk !== null && typeof chunk !== 'function') {
      held.push(toBuffer(chunk, encodingOf(encodingOrCallback)));
    }
    ending = true;
    void finish(done);
    return res;
  } as any;
}

/**
 * Create Prism payment middleware for Express
 *
 * @param config - Prism middleware configuration
 * @param routes - Routes configuration with payment requirements
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * app.use(prismPaymentMiddleware(
 *   {
 *     apiKey: 'dev-key-123'
 *   },
 *   {
 *     '/api/premium': {
 *       price: 0.01,
 *       description: 'Premium API access'
 *     },
 *     '/weather': {
 *       price: '$0.001',
 *       description: 'Weather data'
 *     }
 *   }
 * ));
 * ```
 */
export function prismPaymentMiddleware(
  config: PrismMiddlewareConfig,
  routes: RoutesConfig
) {
  // Create middleware core instance
  const core = new PrismMiddlewareCore(config, routes);

  return async function (req: Request, res: Response, next: NextFunction) {
    // Construct resource URL — prefer config.resourceBaseUrl to avoid Host header injection
    const base = (config.resourceBaseUrl ?? `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const resourceUrl = `${base}${req.originalUrl}`;

    // Get payment header (supports both v1 X-PAYMENT and v2 PAYMENT-SIGNATURE)
    const paymentHeader = HeaderAdapter.getPaymentPayload((name) => req.header(name) || null);

    // Detect protocol version from header name or payload
    let protocolVersion: 1 | 2 = config.x402Version || 2; // Default to v2
    if (paymentHeader) {
      const detected = detectProtocolVersion(paymentHeader);
      if (detected) {
        protocolVersion = detected;
      }
    }

    // Process request through middleware core
    const result = await core.handleRequest({
      path: req.path,
      paymentHeader: paymentHeader || undefined,
      resourceUrl,
      protocolVersion,
    });

    // If middleware handled the request (returned error or 402)
    if (result.handled) {
      // Set headers
      if (result.headers) {
        Object.entries(result.headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
      }

      return res.status(result.statusCode!).json(result.body);
    }

    // Payment verified or route not protected
    if (result.paymentInfo) {
      // Store payment info in res.locals for route handler access
      res.locals.payment = result.paymentInfo.payment;
      res.locals.payer = result.paymentInfo.payer;

      holdResponseUntilSettled(res, async () => {
        if (res.statusCode >= 400) {
          return null;
        }

        try {
          const settlementResult = await core.settlementCallback(
            result.paymentInfo!.payment,
            result.paymentInfo!.paymentRequirements,
            res.statusCode
          );

          if (!settlementResult || !settlementResult.success || !settlementResult.transaction) {
            const errorReason = settlementResult?.errorReason || 'Settlement processing failed';
            console.error('Settlement failed:', errorReason);
            return {
              status: 402,
              body: {
                x402Version: protocolVersion,
                error: 'Payment settlement failed',
                details: errorReason,
              },
            };
          }

          if (!res.headersSent) {
            const settlementBase64 = Buffer.from(JSON.stringify(settlementResult)).toString('base64');
            HeaderAdapter.setSettlementResponse(
              (name, value) => res.setHeader(name, value),
              settlementBase64,
              protocolVersion
            );
          }
          return null;
        } catch (error: any) {
          console.error('Settlement error:', error);
          return {
            status: 500,
            body: {
              x402Version: protocolVersion,
              error: 'Settlement processing error',
              details: 'An error occurred while settling the payment. Please try again.',
            },
          };
        }
      });
    }

    // Execute the route handler
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await next();
  };
}
