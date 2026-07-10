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
