using System.Globalization;
using System.Text.Json;

namespace Prism.Core.Utils;

public sealed class PaymentReplayGuard
{
    public const int DefaultMaxEntries = 10_000;
    public static readonly TimeSpan DefaultInFlightTtl = TimeSpan.FromSeconds(60);

    private sealed record Entry(DateTimeOffset ExpiresAt, bool Consumed, long Sequence, object? Settlement = null);

    private readonly object _gate = new();
    private readonly Dictionary<string, Entry> _entries = new();
    private readonly int _maxEntries;
    private readonly TimeSpan _inFlightTtl;
    private readonly Func<DateTimeOffset> _utcNow;
    private long _sequence;

    public PaymentReplayGuard(Func<DateTimeOffset>? utcNow = null, int maxEntries = DefaultMaxEntries, TimeSpan? inFlightTtl = null)
    {
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
        _maxEntries = maxEntries;
        _inFlightTtl = inFlightTtl ?? DefaultInFlightTtl;
    }

    public static string? ProofKey(JsonElement payment)
    {
        if (payment.ValueKind != JsonValueKind.Object
            || !payment.TryGetProperty("payload", out var payload)
            || payload.ValueKind != JsonValueKind.Object
            || !payload.TryGetProperty("authorization", out var authorization)
            || authorization.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var from = GetString(authorization, "from");
        var nonce = GetString(authorization, "nonce");
        return string.IsNullOrEmpty(from) || string.IsNullOrEmpty(nonce)
            ? null
            : $"{from}:{nonce}".ToLowerInvariant();
    }

    public static DateTimeOffset? ValidBefore(JsonElement payment)
    {
        if (payment.ValueKind == JsonValueKind.Object
            && payment.TryGetProperty("payload", out var payload)
            && payload.ValueKind == JsonValueKind.Object
            && payload.TryGetProperty("authorization", out var authorization)
            && long.TryParse(GetString(authorization, "validBefore"), NumberStyles.None, CultureInfo.InvariantCulture, out var seconds)
            && seconds >= DateTimeOffset.MinValue.ToUnixTimeSeconds()
            && seconds <= DateTimeOffset.MaxValue.ToUnixTimeSeconds())
        {
            return DateTimeOffset.FromUnixTimeSeconds(seconds);
        }

        return null;
    }

    public bool TryReserve(string key)
    {
        var now = _utcNow();
        lock (_gate)
        {
            if (_entries.TryGetValue(key, out var existing) && existing.ExpiresAt > now)
            {
                return false;
            }

            _entries.Remove(key);

            if (_entries.Count >= _maxEntries)
            {
                Sweep(now);
            }

            if (_entries.Count >= _maxEntries && !EvictOldestConsumed())
            {
                return false;
            }

            _entries[key] = new Entry(now + _inFlightTtl, false, ++_sequence);
            return true;
        }
    }

    public T? SettlementFor<T>(string key) where T : class
    {
        var now = _utcNow();
        lock (_gate)
        {
            return _entries.TryGetValue(key, out var entry) && entry.Consumed && entry.ExpiresAt > now
                ? entry.Settlement as T
                : null;
        }
    }

    public void MarkConsumed(string key, DateTimeOffset? validBefore, object? settlement = null)
    {
        var now = _utcNow();
        var expiresAt = validBefore is { } limit && limit > now ? limit : now + _inFlightTtl;
        lock (_gate)
        {
            _entries[key] = new Entry(expiresAt, true, ++_sequence, settlement);
        }
    }

    public void Release(string key)
    {
        lock (_gate)
        {
            if (_entries.TryGetValue(key, out var entry) && !entry.Consumed)
            {
                _entries.Remove(key);
            }
        }
    }

    private void Sweep(DateTimeOffset now)
    {
        foreach (var key in _entries.Where(pair => pair.Value.ExpiresAt <= now).Select(pair => pair.Key).ToList())
        {
            _entries.Remove(key);
        }
    }

    private bool EvictOldestConsumed()
    {
        var oldest = _entries
            .Where(pair => pair.Value.Consumed)
            .OrderBy(pair => pair.Value.Sequence)
            .Select(pair => pair.Key)
            .FirstOrDefault();

        return oldest is not null && _entries.Remove(oldest);
    }

    private static string? GetString(JsonElement element, string propertyName) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(propertyName, out var property)
        && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;
}
