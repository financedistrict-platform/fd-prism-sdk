from __future__ import annotations

import threading
import time
from collections import OrderedDict
from typing import Any, Dict, Optional

DEFAULT_IN_FLIGHT_TTL_SECONDS = 600
DEFAULT_MAX_TRACKED_PROOFS = 10_000


def payment_proof_key(payment: Any) -> Optional[str]:
    if not isinstance(payment, dict):
        return None
    payload = payment.get('payload')
    authorization = payload.get('authorization') if isinstance(payload, dict) else None
    if not isinstance(authorization, dict):
        return None
    sender = authorization.get('from')
    nonce = authorization.get('nonce')
    if not sender or not nonce:
        return None
    return f'{sender}:{nonce}'.lower()


def _epoch_seconds(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class PaymentReplayGuard:
    def __init__(
        self,
        max_entries: int = DEFAULT_MAX_TRACKED_PROOFS,
        in_flight_ttl_seconds: float = DEFAULT_IN_FLIGHT_TTL_SECONDS,
    ):
        self._max_entries = max_entries
        self._in_flight_ttl = in_flight_ttl_seconds
        self._entries: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
        self._lock = threading.Lock()

    def try_reserve(self, key: str, valid_before: Any = None) -> bool:
        now = time.time()
        with self._lock:
            existing = self._entries.get(key)
            if existing is not None and existing['expires_at'] > now:
                return False
            self._entries.pop(key, None)

            if len(self._entries) >= self._max_entries:
                self._sweep(now)
            if len(self._entries) >= self._max_entries and not self._evict_oldest_consumed():
                return False

            expires_at = now + self._in_flight_ttl
            limit = _epoch_seconds(valid_before)
            if limit is not None:
                expires_at = min(expires_at, limit)
            self._entries[key] = {'expires_at': expires_at, 'consumed': False}
            return True

    def settlement_for(self, key: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            entry = self._entries.get(key)
            if entry is not None and entry['consumed'] and entry['expires_at'] > time.time():
                return entry['settlement']
            return None

    def mark_consumed(self, key: str, valid_before: Any, settlement: Optional[Dict[str, Any]] = None) -> None:
        now = time.time()
        expires_at = _epoch_seconds(valid_before)
        if expires_at is None or expires_at <= now:
            expires_at = now + self._in_flight_ttl
        with self._lock:
            self._entries.pop(key, None)
            self._entries[key] = {'expires_at': expires_at, 'consumed': True, 'settlement': settlement}

    def release(self, key: str) -> None:
        with self._lock:
            entry = self._entries.get(key)
            if entry is not None and not entry['consumed']:
                del self._entries[key]

    def _sweep(self, now: float) -> None:
        for key in [k for k, e in self._entries.items() if e['expires_at'] <= now]:
            del self._entries[key]

    def _evict_oldest_consumed(self) -> bool:
        for key, entry in self._entries.items():
            if entry['consumed']:
                del self._entries[key]
                return True
        return False
