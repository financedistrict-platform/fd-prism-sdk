using Prism.Core.Types;
using Prism.Core.Utils;
using Xunit;

namespace Prism.Tests;

public class PriceParserTests
{
    [Theory]
    [InlineData("$0.01", 0.01)]
    [InlineData("€1.50", 1.50)]
    [InlineData("£2", 2)]
    [InlineData("¥100", 100)]
    [InlineData("0.5", 0.5)]
    [InlineData("10000", 10000)]
    [InlineData(".5", 0.5)]
    [InlineData("  $1.25  ", 1.25)]
    [InlineData("0.001 USDC", 0.001)]
    [InlineData("$10 USD", 10)]
    [InlineData("5.", 5)]
    public void ParsesValidStringPrices(string input, double expected)
    {
        Assert.Equal(expected, PriceParser.ParsePrice(input), 5);
    }

    [Fact]
    public void AcceptsPlainNumericPrice()
    {
        Assert.Equal(1.23, PriceParser.ParsePrice(1.23), 5);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("not-a-number")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("$")]
    [InlineData("1,000")]
    [InlineData("1,000.50")]
    [InlineData("1e3")]
    [InlineData("1_000")]
    [InlineData("10USD")]
    [InlineData("10 US$")]
    [InlineData("10 USDC extra")]
    [InlineData("1 000")]
    [InlineData("$1.2.3")]
    [InlineData("1$2")]
    [InlineData("$$1")]
    [InlineData("+1")]
    [InlineData("NaN")]
    [InlineData("Infinity")]
    public void RejectsInvalidStringPrices(string input)
    {
        Assert.Throws<PrismValidationError>(() => PriceParser.ParsePrice(input));
    }

    [Theory]
    [InlineData(0d)]
    [InlineData(-5d)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public void RejectsInvalidNumericPrices(double input)
    {
        // Deliberate improvement over TS (which leaves numeric input unvalidated) — see PriceParser doc comment.
        Assert.Throws<PrismValidationError>(() => PriceParser.ParsePrice(input));
    }
}
