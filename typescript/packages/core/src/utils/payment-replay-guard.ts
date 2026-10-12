export const DEFAULT_IN_FLIGHT_TTL_MS = 600_000;
export const DEFAULT_MAX_TRACKED_PROOFS = 10_000;

interface GuardEntry {
  expiresAt: number;
  consumed: boolean;
  owner?: object;
  settlement?: unknown;
}

export function paymentProofKey(payment: any): string | null {
  const authorization = payment?.payload?.authorization;
  if (!authorization?.from || !authorization?.nonce) {
    return null;
  }
  return `${authorization.from}:${authorization.nonce}`.toLowerCase();
}

export function paymentValidBefore(payment: any): number {
  return Number(payment?.payload?.authorization?.validBefore);
}

export class PaymentReplayGuard {
  private readonly entries = new Map<string, GuardEntry>();

  constructor(
    private readonly maxEntries: number = DEFAULT_MAX_TRACKED_PROOFS,
    private readonly inFlightTtlMs: number = DEFAULT_IN_FLIGHT_TTL_MS
  ) {}

  tryReserve(key: string, validBeforeSeconds?: number, owner?: object): boolean {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > now) {
      return !existing.consumed && owner !== undefined && existing.owner === owner;
    }
    this.entries.delete(key);

    if (this.entries.size >= this.maxEntries) {
      this.sweep(now);
    }
    if (this.entries.size >= this.maxEntries && !this.evictOldestConsumed()) {
      return false;
    }

    const validBeforeMs = (validBeforeSeconds ?? NaN) * 1000;
    const expiresAt = Number.isFinite(validBeforeMs) ? Math.min(now + this.inFlightTtlMs, validBeforeMs) : now + this.inFlightTtlMs;
    this.entries.set(key, { expiresAt, consumed: false, owner });
    return true;
  }

  settlementFor<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.consumed && entry.expiresAt > Date.now()) {
      return entry.settlement as T | undefined;
    }
    return undefined;
  }

  markConsumed(key: string, validBeforeSeconds: number, settlement?: unknown): void {
    const now = Date.now();
    const validBeforeMs = validBeforeSeconds * 1000;
    const expiresAt = Number.isFinite(validBeforeMs) && validBeforeMs > now ? validBeforeMs : now + this.inFlightTtlMs;
    this.entries.delete(key);
    this.entries.set(key, { expiresAt, consumed: true, settlement });
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

export function replayGuardFor(config: { replayReservationSeconds?: number }): PaymentReplayGuard {
  let guard = guardsByConfig.get(config);
  if (!guard) {
    const seconds = config.replayReservationSeconds;
    const ttlMs = seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_IN_FLIGHT_TTL_MS;
    guard = new PaymentReplayGuard(DEFAULT_MAX_TRACKED_PROOFS, ttlMs);
    guardsByConfig.set(config, guard);
  }
  return guard;
}
