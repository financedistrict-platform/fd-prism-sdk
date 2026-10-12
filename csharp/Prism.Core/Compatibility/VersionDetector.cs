using System.Text;
using System.Text.Json;

namespace Prism.Core.Compatibility;

/// <summary>
/// Detects the x402 protocol version of a payment payload from its *content*
/// (as opposed to HeaderAdapter.DetectVersionFromHeaders, which only looks at
/// which header name was used). Mirrors typescript/packages/core/src/compatibility/version-detector.ts.
/// </summary>
public static class VersionDetector
{
    /// <summary>
    /// Accepts either a raw payload string (plain JSON, or base64-encoded JSON — tried in that
    /// order) or an already-parsed <see cref="JsonElement"/>. Returns 1 or 2 based on the
    /// payload's declared x402Version field: an explicit 1 or 2 is returned as-is, anything
    /// greater than 2 defaults to the latest supported version (2), and a missing/absent field
    /// also defaults to 2. Returns null only on total parse failure.
    /// </summary>
    public static int? DetectProtocolVersion(object? payload)
    {
        try
        {
            JsonElement element;

            if (payload is JsonElement je)
            {
                element = je;
            }
            else if (payload is string s)
            {
                if (!TryParseJson(s, out element))
                {
                    return null;
                }
            }
            else
            {
                return null;
            }

            if (element.ValueKind == JsonValueKind.Object &&
                element.TryGetProperty("x402Version", out var versionProp))
            {
                if (versionProp.ValueKind == JsonValueKind.Number && versionProp.TryGetInt32(out var version))
                {
                    if (version == 1) return 1;
                    if (version == 2) return 2;
                    if (version > 2) return 2;
                }
            }

            // Missing/absent/unrecognized x402Version defaults to the latest supported version.
            return 2;
        }
        catch
        {
            return null;
        }
    }

    private static bool TryParseJson(string raw, out JsonElement element)
    {
        // Try plain JSON first.
        try
        {
            using var doc = JsonDocument.Parse(raw);
            element = doc.RootElement.Clone();
            return true;
        }
        catch (JsonException)
        {
            // Fall back to base64-encoded JSON.
        }

        try
        {
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(raw));
            using var doc = JsonDocument.Parse(decoded);
            element = doc.RootElement.Clone();
            return true;
        }
        catch
        {
            element = default;
            return false;
        }
    }

    public static bool IsV1Payload(object? payload) => DetectProtocolVersion(payload) == 1;

    public static bool IsV2Payload(object? payload) => DetectProtocolVersion(payload) == 2;

    public static bool IsValidProtocolVersion(int? version) => version == 1 || version == 2;

    public static int GetDefaultProtocolVersion() => 2;
}
