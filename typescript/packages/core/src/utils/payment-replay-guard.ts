export const DEFAULT_IN_FLIGHT_TTL_MS = 60_000;
export const DEFAULT_MAX_TRACKED_PROOFS = 10_000;

interface GuardEntry {
  expiresAt: number;
  consumed: boolean;
}

export function paymentProofKey(payment: any): string | null {
  const authorization = payment?.payload?.authorization;
  if (!authorization?.from || !authorization?.nonce) {
    return null;
  }
  return `${authorization.from}:${authorization.nonce}`.toLowerCase();
}

export class PaymentReplayGuard {
  private readonly entries = new Map<string, GuardEntry>();

  constructor(
    private readonly maxEntries: number = DEFAULT_MAX_TRACKED_PROOFS,
    private readonly inFlightTtlMs: number = DEFAULT_IN_FLIGHT_TTL_MS
  ) {}

  tryReserve(key: string): boolean {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > now) {
      return false;
    }
    this.entries.delete(key);

    if (this.entries.size >= this.maxEntries) {
      this.sweep(now);
    }
    if (this.entries.size >= this.maxEntries && !this.evictOldestConsumed()) {
      return false;
    }

    this.entries.set(key, { expiresAt: now + this.inFlightTtlMs, consumed: false });
    return true;
  }

  markConsumed(key: string, validBeforeSeconds: number): void {
    const now = Date.now();
    const validBeforeMs = validBeforeSeconds * 1000;
    const expiresAt = Number.isFinite(validBeforeMs) && validBeforeMs > now ? validBeforeMs : now + this.inFlightTtlMs;
    this.entries.delete(key);
    this.entries.set(key, { expiresAt, consumed: true });
  }

  release(key: string): void {
    const entry = this.entries.get(key);
    if (entry && !entry.consumed) {
      this.entries.delete(key);
    }
  }

  private sweep(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private evictOldestConsumed(): boolean {
    for (const [key, entry] of this.entries) {
      if (entry.consumed) {
        this.entries.delete(key);
        return true;
      }
    }
    return false;
  }
}

const guardsByConfig = new WeakMap<object, PaymentReplayGuard>();

export function replayGuardFor(config: object): PaymentReplayGuard {
  let guard = guardsByConfig.get(config);
  if (!guard) {
    guard = new PaymentReplayGuard();
    guardsByConfig.set(config, guard);
  }
  return guard;
}
