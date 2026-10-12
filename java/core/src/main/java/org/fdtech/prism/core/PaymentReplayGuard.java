package org.fdtech.prism.core;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.LongSupplier;

final class PaymentReplayGuard {
    static final int DEFAULT_MAX_ENTRIES = 10_000;
    static final long DEFAULT_RESERVATION_SECONDS = 600;

    private static final class Entry {
        final long expiresAtMillis;
        final boolean consumed;
        final Object owner;
        final String settlement;

        Entry(long expiresAtMillis, boolean consumed, Object owner, String settlement) {
            this.expiresAtMillis = expiresAtMillis;
            this.consumed = consumed;
            this.owner = owner;
            this.settlement = settlement;
        }
    }

    private final Map<String, Entry> entries = new LinkedHashMap<>();
    private final int maxEntries;
    private final long reservationMillis;
    private final LongSupplier clock;

    PaymentReplayGuard(long reservationSeconds) {
        this(DEFAULT_MAX_ENTRIES, reservationSeconds * 1000, System::currentTimeMillis);
    }

    PaymentReplayGuard(int maxEntries, long reservationMillis, LongSupplier clock) {
        this.maxEntries = maxEntries;
        this.reservationMillis = reservationMillis;
        this.clock = clock;
    }

    synchronized boolean windowClosed(Long validBeforeMillis) {
        return validBeforeMillis != null && validBeforeMillis <= clock.getAsLong();
    }

    synchronized boolean tryReserve(String key, Long validBeforeMillis, Object owner) {
        long now = clock.getAsLong();
        Entry existing = entries.get(key);
        if (existing != null && existing.expiresAtMillis > now) {
            return !existing.consumed && owner != null && existing.owner == owner;
        }
        entries.remove(key);

        if (entries.size() >= maxEntries) {
            sweep(now);
        }
        if (entries.size() >= maxEntries && !evictOldestConsumed()) {
            return false;
        }

        long expiresAt = now + reservationMillis;
        if (validBeforeMillis != null) {
            expiresAt = Math.min(expiresAt, validBeforeMillis);
        }
        entries.put(key, new Entry(expiresAt, false, owner, null));
        return true;
    }

    synchronized String settlementFor(String key) {
        Entry entry = entries.get(key);
        return entry != null && entry.consumed && entry.expiresAtMillis > clock.getAsLong() ? entry.settlement : null;
    }

    synchronized void markConsumed(String key, Long validBeforeMillis, String settlement) {
        long now = clock.getAsLong();
        long expiresAt = validBeforeMillis != null && validBeforeMillis > now ? validBeforeMillis : now + reservationMillis;
        entries.remove(key);
        entries.put(key, new Entry(expiresAt, true, null, settlement));
    }

    synchronized void release(String key) {
        Entry entry = entries.get(key);
        if (entry != null && !entry.consumed) {
            entries.remove(key);
        }
    }

    private void sweep(long now) {
        entries.values().removeIf(entry -> entry.expiresAtMillis <= now);
    }

    private boolean evictOldestConsumed() {
        Iterator<Entry> iterator = entries.values().iterator();
        while (iterator.hasNext()) {
            if (iterator.next().consumed) {
                iterator.remove();
                return true;
            }
        }
        return false;
    }
}
