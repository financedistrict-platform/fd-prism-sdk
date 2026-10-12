package org.fdtech.prism.core;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.LongSupplier;

public final class PaymentReplayGuard {
    public static final int DEFAULT_MAX_ENTRIES = 10_000;
    public static final long DEFAULT_IN_FLIGHT_TTL_MILLIS = 60_000L;
    public static final long DEFAULT_CONSUMED_TTL_MILLIS = 600_000L;

    private static final class Entry {
        final long expiresAt;
        final boolean consumed;

        Entry(long expiresAt, boolean consumed) {
            this.expiresAt = expiresAt;
            this.consumed = consumed;
        }
    }

    private final Map<String, Entry> entries = new LinkedHashMap<>();
    private final int maxEntries;
    private final long inFlightTtlMillis;
    private final long consumedTtlMillis;
    private final LongSupplier clock;

    public PaymentReplayGuard() {
        this(DEFAULT_MAX_ENTRIES, DEFAULT_IN_FLIGHT_TTL_MILLIS, DEFAULT_CONSUMED_TTL_MILLIS, System::currentTimeMillis);
    }

    public PaymentReplayGuard(int maxEntries, long inFlightTtlMillis, long consumedTtlMillis, LongSupplier clock) {
        this.maxEntries = maxEntries;
        this.inFlightTtlMillis = inFlightTtlMillis;
        this.consumedTtlMillis = consumedTtlMillis;
        this.clock = clock;
    }

    public synchronized boolean tryReserve(String key) {
        long now = clock.getAsLong();
        Entry existing = entries.get(key);
        if (existing != null && existing.expiresAt > now) {
            return false;
        }
        entries.remove(key);

        if (entries.size() >= maxEntries) {
            sweep(now);
        }
        if (entries.size() >= maxEntries && !evictOldestConsumed()) {
            return false;
        }

        entries.put(key, new Entry(now + inFlightTtlMillis, false));
        return true;
    }

    public synchronized void markConsumed(String key) {
        entries.remove(key);
        entries.put(key, new Entry(clock.getAsLong() + consumedTtlMillis, true));
    }

    public synchronized void release(String key) {
        Entry entry = entries.get(key);
        if (entry != null && !entry.consumed) {
            entries.remove(key);
        }
    }

    private void sweep(long now) {
        entries.values().removeIf(entry -> entry.expiresAt <= now);
    }

    private boolean evictOldestConsumed() {
        for (Map.Entry<String, Entry> candidate : entries.entrySet()) {
            if (candidate.getValue().consumed) {
                entries.remove(candidate.getKey());
                return true;
            }
        }
        return false;
    }
}
