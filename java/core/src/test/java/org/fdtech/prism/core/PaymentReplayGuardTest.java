package org.fdtech.prism.core;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class PaymentReplayGuardTest {
    private static final long START = 1_000_000_000L;

    private AtomicLong now;
    private PaymentReplayGuard guard;

    @BeforeEach
    void setUp() {
        now = new AtomicLong(START);
        guard = new PaymentReplayGuard(3, 600_000, now::get);
    }

    @Test
    void reservesOnceUntilReleased() {
        assertTrue(guard.tryReserve("a", null, null));
        assertFalse(guard.tryReserve("a", null, null));

        guard.release("a");

        assertTrue(guard.tryReserve("a", null, null));
    }

    @Test
    void aReservationEndsAtTheEarlierOfValidBeforeAndTheLimit() {
        assertTrue(guard.tryReserve("soon", START + 5_000, null));
        assertTrue(guard.tryReserve("late", START + 3_600_000, null));

        now.addAndGet(5_001);
        assertTrue(guard.tryReserve("soon", null, null));
        assertFalse(guard.tryReserve("late", null, null));

        now.addAndGet(600_000);
        assertTrue(guard.tryReserve("late", null, null));
    }

    @Test
    void aConsumedProofStaysUntilItsValidBefore() {
        guard.markConsumed("paid", START + 3_600_000, "proof=1");

        now.addAndGet(1_800_000);
        assertFalse(guard.tryReserve("paid", null, null));
        assertEquals("proof=1", guard.settlementFor("paid"));

        now.addAndGet(1_800_001);
        assertNull(guard.settlementFor("paid"));
        assertTrue(guard.tryReserve("paid", null, null));
    }

    @Test
    void aConsumedProofWithoutAUsableValidBeforeIsHeldForTheLimit() {
        guard.markConsumed("paid", START - 1, null);

        now.addAndGet(599_000);
        assertFalse(guard.tryReserve("paid", null, null));

        now.addAndGet(2_000);
        assertTrue(guard.tryReserve("paid", null, null));
    }

    @Test
    void releaseNeverDropsAConsumedProof() {
        guard.markConsumed("paid", null, "proof=1");

        guard.release("paid");

        assertFalse(guard.tryReserve("paid", null, null));
    }

    @Test
    void theSameOwnerMayReenterAnActiveReservationButNotAConsumedOne() {
        Object owner = new Object();
        assertTrue(guard.tryReserve("a", null, owner));
        assertTrue(guard.tryReserve("a", null, owner));
        assertFalse(guard.tryReserve("a", null, new Object()));
        assertFalse(guard.tryReserve("a", null, null));

        guard.markConsumed("a", null, "proof=1");

        assertFalse(guard.tryReserve("a", null, owner));
    }

    @Test
    void failsClosedWhenEverySlotHoldsAnActiveReservation() {
        assertTrue(guard.tryReserve("a", null, null));
        assertTrue(guard.tryReserve("b", null, null));
        assertTrue(guard.tryReserve("c", null, null));

        assertFalse(guard.tryReserve("d", null, null));
    }

    @Test
    void makesRoomByDroppingExpiredEntriesFirst() {
        assertTrue(guard.tryReserve("a", START + 1_000, null));
        assertTrue(guard.tryReserve("b", null, null));
        assertTrue(guard.tryReserve("c", null, null));
        now.addAndGet(1_001);

        assertTrue(guard.tryReserve("d", null, null));
        assertFalse(guard.tryReserve("b", null, null));
    }

    @Test
    void makesRoomByEvictingTheOldestConsumedProof() {
        assertTrue(guard.tryReserve("active", null, null));
        guard.markConsumed("old", null, "proof=old");
        guard.markConsumed("new", null, "proof=new");

        assertTrue(guard.tryReserve("fresh", null, null));

        assertFalse(guard.tryReserve("active", null, null));
        assertNull(guard.settlementFor("old"));
        assertEquals("proof=new", guard.settlementFor("new"));
    }

    @Test
    void windowClosedOnlyOncePastValidBefore() {
        assertFalse(guard.windowClosed(null));
        assertFalse(guard.windowClosed(START + 1));
        assertTrue(guard.windowClosed(START));
        assertTrue(guard.windowClosed(START - 1));
    }

    @Test
    void concurrentReservationsOfOneKeyHaveOneWinner() throws Exception {
        PaymentReplayGuard shared = new PaymentReplayGuard(10_000, 600_000, System::currentTimeMillis);
        int threads = 64;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            CountDownLatch go = new CountDownLatch(1);
            List<Future<Boolean>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(() -> {
                    go.await();
                    return shared.tryReserve("one-proof", null, null);
                }));
            }
            go.countDown();
            int winners = 0;
            for (Future<Boolean> future : futures) {
                if (future.get(30, TimeUnit.SECONDS)) {
                    winners++;
                }
            }
            assertEquals(1, winners);
        } finally {
            pool.shutdownNow();
        }
    }
}
