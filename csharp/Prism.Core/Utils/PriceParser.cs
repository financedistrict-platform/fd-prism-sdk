using System.Globalization;
using System.Text.RegularExpressions;
using Prism.Core.Types;

namespace Prism.Core.Utils;

/// <summary>
/// Parses a route's configured Price (a currency-prefixed string, e.g. "$0.01", or a
/// numeric value) into a plain double amount. Mirrors typescript/packages/core/src/utils/price-parser.ts,
/// with one deliberate improvement: TS leaves a numeric price value completely
/// unvalidated (a negative/NaN/Infinity number passes straight through); this port
/// validates the numeric path too, since there's no reason to carry that asymmetry
/// into new code.
/// </summary>
public static class PriceParser
{
    private static readonly Regex PricePattern = new(
        @"^[$€£¥]?\s*(?<amount>[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:\s+[A-Za-z]{2,10})?\z",
        RegexOptions.CultureInvariant);

    public static double ParsePrice(object price)
    {
        double parsed;

        switch (price)
        {
            case double d:
                parsed = d;
                break;
            case float f:
                parsed = f;
                break;
            case int i:
                parsed = i;
                break;
            case long l:
                parsed = l;
                break;
            case decimal dec:
                parsed = (double)dec;
                break;
            case string s:
                var match = PricePattern.Match(s.Trim());
                if (!match.Success
                    || !double.TryParse(match.Groups["amount"].Value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out parsed))
                {
                    throw new PrismValidationError($"Invalid price value: {price}", "price");
                }
                break;
            default:
                throw new PrismValidationError($"Invalid price value: {price}", "price");
        }

        if (!double.IsFinite(parsed) || parsed <= 0)
        {
            throw new PrismValidationError($"Invalid price value: {price}", "price");
        }

        return parsed;
    }
}
