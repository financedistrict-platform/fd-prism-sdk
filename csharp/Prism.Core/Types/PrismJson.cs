using System.Text.Json;
using System.Text.Json.Serialization;

namespace Prism.Core.Types;

/// <summary>
/// Shared JSON options used everywhere a Prism wire type is (de)serialized.
/// CamelCase naming reproduces the exact field names used by the x402 protocol
/// (e.g. "x402Version", "maxAmountRequired", "payTo", "validAfter") without
/// needing a [JsonPropertyName] attribute on every property.
/// </summary>
public static class PrismJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}
