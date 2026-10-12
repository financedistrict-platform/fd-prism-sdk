using System.Globalization;
using System.Numerics;
using System.Text.Json;
using Prism.Core.Compatibility;
using Prism.Core.Types.V2;

namespace Prism.Core.Utils;

public static class PaymentValidator
{
    private const int MaxDecimalDigits = 78;

    public static PaymentRequirements? FindRequirementForPayment(IEnumerable<PaymentRequirements> requirements, JsonElement payment) =>
        requirements.FirstOrDefault(requirement => PaymentAcceptsRequirement(payment, requirement));

    public static bool PaymentAcceptsRequirement(JsonElement payment, PaymentRequirements requirement)
    {
        if (!IsV2(payment))
        {
            return GetString(payment, "scheme") == requirement.Scheme
                && SameNetwork(GetString(payment, "network"), requirement.Network);
        }

        if (!payment.TryGetProperty("accepted", out var accepted) || accepted.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        return GetString(accepted, "scheme") == requirement.Scheme
            && GetString(accepted, "network") == requirement.Network
            && SameText(GetString(accepted, "asset"), requirement.Asset)
            && SameText(GetString(accepted, "payTo"), requirement.PayTo)
            && SameAmount(GetString(accepted, "amount"), requirement.Amount);
    }

    public static string? ValidateBinding(JsonElement payment, PaymentRequirements requirement)
    {
        if (!PaymentAcceptsRequirement(payment, requirement))
        {
            return "Payment does not match the payment requirement";
        }

        if (!TryGetAuthorization(payment, out var authorization))
        {
            return "Payment authorization is missing";
        }

        if (!SameText(GetString(authorization, "to"), requirement.PayTo))
        {
            return "Payment recipient does not match the payment requirement";
        }

        if (!SameAmount(GetString(authorization, "value"), requirement.Amount))
        {
            return "Payment amount does not match the payment requirement";
        }

        return null;
    }

    public static string? ValidateWindow(JsonElement payment, DateTimeOffset now)
    {
        if (!TryGetAuthorization(payment, out var authorization)
            || !TryParseDecimal(GetString(authorization, "validAfter"), out var validAfter)
            || !TryParseDecimal(GetString(authorization, "validBefore"), out var validBefore))
        {
            return "Payment validity window is malformed";
        }

        var nowSeconds = new BigInteger(now.ToUnixTimeSeconds());
        if (validAfter > nowSeconds)
        {
            return "Payment is not yet valid";
        }

        if (validBefore <= nowSeconds)
        {
            return "Payment has expired";
        }

        return null;
    }

    public static string? ValidateResource(JsonElement payment, string expectedResourceUrl)
    {
        if (!payment.TryGetProperty("resource", out var resource) || resource.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        return GetString(resource, "url") == expectedResourceUrl
            ? null
            : "Payment resource does not match the requested resource";
    }

    private static bool IsV2(JsonElement payment) =>
        payment.ValueKind == JsonValueKind.Object
        && payment.TryGetProperty("x402Version", out var version)
        && version.ValueKind == JsonValueKind.Number
        && version.TryGetInt32(out var number)
        && number == 2;

    private static bool TryGetAuthorization(JsonElement payment, out JsonElement authorization)
    {
        authorization = default;
        return payment.ValueKind == JsonValueKind.Object
            && payment.TryGetProperty("payload", out var payload)
            && payload.ValueKind == JsonValueKind.Object
            && payload.TryGetProperty("authorization", out authorization)
            && authorization.ValueKind == JsonValueKind.Object;
    }

    private static string? GetString(JsonElement element, string propertyName) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(propertyName, out var property)
        && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;

    private static bool SameText(string? a, string? b) =>
        a is not null && b is not null && string.Equals(a, b, StringComparison.OrdinalIgnoreCase);

    private static bool SameAmount(string? a, string? b) =>
        TryParseDecimal(a, out var left) && TryParseDecimal(b, out var right) && left == right;

    private static bool SameNetwork(string? declared, string required)
    {
        if (declared is null)
        {
            return false;
        }

        if (declared == required)
        {
            return true;
        }

        try
        {
            return NetworkMapper.NetworkV1ToV2Convert(declared) == required;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    private static bool TryParseDecimal(string? value, out BigInteger result)
    {
        result = default;
        return value is { Length: > 0 and <= MaxDecimalDigits }
            && value.All(character => character is >= '0' and <= '9')
            && BigInteger.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out result);
    }
}
