import type { ServerResponse } from 'http';
import { HeaderAdapter } from '../compatibility';
import { PrismConfigError, describeError } from '../types/errors';
import type { PrismMiddlewareCore, MiddlewareResult } from './middleware-core';

export const DEFAULT_MAX_HELD_RESPONSE_BYTES = 8 * 1024 * 1024;

export interface SettlementRejection {
  status: number;
  body: Record<string, unknown>;
}

type Settle = () => Promise<SettlementRejection | null>;

const responseHolds = new WeakMap<ServerResponse, (settle: Settle) => boolean>();

export type VerifiedPaymentInfo = NonNullable<MiddlewareResult['paymentInfo']>;

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

export function resolveMaxHeldResponseBytes(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_MAX_HELD_RESPONSE_BYTES;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PrismConfigError('maxHeldResponseBytes must be a positive integer number of bytes', {
      maxHeldResponseBytes: value,
    });
  }
  return value;
}

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

function applyHeaders(res: ServerResponse, headers: unknown): void {
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

export function createResponseSettler(
  core: PrismMiddlewareCore,
  paymentInfo: VerifiedPaymentInfo,
  res: ServerResponse,
  protocolVersion: 1 | 2
): () => Promise<SettlementRejection | null> {
  return async () => {
    if (res.statusCode >= 400) {
      return null;
    }

    try {
      const settlementResult = await core.settlementCallback(
        paymentInfo.payment,
        paymentInfo.paymentRequirements,
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
      console.error('Settlement error:', describeError(error));
      return {
        status: 500,
        body: {
          x402Version: protocolVersion,
          error: 'Settlement processing error',
          details: 'An error occurred while settling the payment. Please try again.',
        },
      };
    }
  };
}

export function holdResponseUntilSettled(
  res: ServerResponse,
  initialSettle: Settle,
  options: { protocolVersion: 1 | 2; maxHeldBytes: number }
): boolean {
  const existing = responseHolds.get(res);
  if (existing) {
    return existing(initialSettle);
  }

  let settle = initialSettle;
  const originalWrite = res.write.bind(res) as (...args: any[]) => boolean;
  const originalEnd = res.end.bind(res) as (...args: any[]) => ServerResponse;
  const originalWriteHead = res.writeHead.bind(res) as (...args: any[]) => ServerResponse;
  const originalFlushHeaders = res.flushHeaders.bind(res);
  const held: Buffer[] = [];
  let heldBytes = 0;
  let phase: 'holding' | 'ending' | 'released' | 'dropped' = 'holding';
  let clientGone = false;

  const discard = () => {
    held.length = 0;
    heldBytes = 0;
  };

  const reject = (rejection: SettlementRejection, done?: () => void) => {
    BODY_DESCRIBING_HEADERS.forEach((name) => res.removeHeader(name));
    if (!res.headersSent) {
      res.statusCode = rejection.status;
      res.setHeader('Content-Type', 'application/json');
    }
    originalEnd(JSON.stringify(rejection.body), done);
  };

  const dropOversized = (done?: () => void) => {
    discard();
    console.error(`Response exceeded the ${options.maxHeldBytes} byte hold limit; payment not settled`);
    phase = 'released';
    reject(
      {
        status: 500,
        body: {
          x402Version: options.protocolVersion,
          error: 'Response too large to settle',
          details: 'The response exceeded the maximum size the server holds before payment settlement.',
        },
      },
      done
    );
    phase = 'dropped';
  };

  const hold = (chunk: Buffer): boolean => {
    heldBytes += chunk.length;
    if (heldBytes > options.maxHeldBytes) {
      return false;
    }
    held.push(chunk);
    return true;
  };

  responseHolds.set(res, (next) => {
    if (phase !== 'holding') {
      return false;
    }
    settle = next;
    return true;
  });

  res.on('close', () => {
    if (res.writableFinished) {
      return;
    }
    clientGone = true;
    if (phase === 'holding') {
      discard();
      phase = 'dropped';
    }
  });

  res.writeHead = function (statusCode: number, reasonOrHeaders?: any, headers?: any) {
    if (phase === 'released') {
      return originalWriteHead(statusCode, reasonOrHeaders, headers);
    }
    if (phase === 'dropped') {
      return res;
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
    if (phase === 'released') {
      originalFlushHeaders();
    }
  };

  res.write = function (chunk: any, encodingOrCallback?: any, callback?: any): boolean {
    if (phase === 'released') {
      return originalWrite(chunk, encodingOrCallback, callback);
    }
    const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    if (phase === 'ending') {
      if (typeof done === 'function') {
        process.nextTick(done, new Error('write after end'));
      }
      return false;
    }
    if (phase === 'holding' && !hold(toBuffer(chunk, encodingOf(encodingOrCallback)))) {
      dropOversized();
    }
    if (typeof done === 'function') {
      process.nextTick(done);
    }
    return true;
  } as any;

  const finish = async (done?: () => void): Promise<void> => {
    if (clientGone || res.destroyed) {
      discard();
      phase = 'dropped';
      return;
    }

    const rejection = await settle();
    phase = 'released';

    if (clientGone) {
      discard();
      return;
    }

    if (rejection) {
      discard();
      reject(rejection, done);
      return;
    }

    held.forEach((part) => originalWrite(part));
    discard();
    originalEnd(done);
  };

  res.end = function (chunk?: any, encodingOrCallback?: any, callback?: any): ServerResponse {
    if (phase === 'released') {
      return originalEnd(chunk, encodingOrCallback, callback);
    }
    const done = [chunk, encodingOrCallback, callback].find((arg) => typeof arg === 'function');
    if (phase === 'ending') {
      return res;
    }
    if (phase === 'dropped') {
      if (typeof done === 'function') {
        process.nextTick(done);
      }
      return res;
    }

    if (chunk !== undefined && chunk !== null && typeof chunk !== 'function') {
      if (!hold(toBuffer(chunk, encodingOf(encodingOrCallback)))) {
        dropOversized(done);
        return res;
      }
    }
    phase = 'ending';
    finish(done).catch((error) => {
      console.error('Response release failed:', describeError(error));
      discard();
      res.destroy();
    });
    return res;
  } as any;

  return true;
}
