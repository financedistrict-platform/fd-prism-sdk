using Prism.Core.Types;
using Prism.Core.Utils;
using Xunit;

namespace Prism.Tests;

public class RouteMatcherTests
{
    private static Dictionary<string, RoutePaymentConfig> Routes(params string[] paths)
    {
        var dict = new Dictionary<string, RoutePaymentConfig>();
        foreach (var p in paths)
        {
            dict[p] = new RoutePaymentConfig { Price = "$0.01" };
        }

        return dict;
    }

    [Fact]
    public void ExactMatchWins()
    {
        var routes = Routes("/api/premium");
        Assert.Equal("/api/premium", RouteMatcher.FindMatchingRoute("/api/premium", routes));
    }

    [Fact]
    public void WildcardMatchesBarePrefix()
    {
        var routes = Routes("/api/*");
        Assert.Equal("/api/*", RouteMatcher.FindMatchingRoute("/api", routes));
    }

    [Fact]
    public void WildcardMatchesNestedPath()
    {
        var routes = Routes("/api/*");
        Assert.Equal("/api/*", RouteMatcher.FindMatchingRoute("/api/anything", routes));
    }

    [Fact]
    public void WildcardDoesNotMatchSiblingWithSharedPrefix()
    {
        // Regression test for the unanchored-prefix bug found (and fixed) in the TS SDK
        // (AUDIT_REPORT.md W-7): "/api/*" must require a path-segment boundary, not just
        // a string prefix — otherwise "/api-evil" or "/apiFoo" would incorrectly match.
        var routes = Routes("/api/*");
        Assert.Null(RouteMatcher.FindMatchingRoute("/api-evil", routes));
        Assert.Null(RouteMatcher.FindMatchingRoute("/apiFoo", routes));
    }

    [Fact]
    public void NoMatchReturnsNull()
    {
        var routes = Routes("/api/premium");
        Assert.Null(RouteMatcher.FindMatchingRoute("/unrelated", routes));
    }

    [Fact]
    public void ExactMatchBeatsEveryWildcard()
    {
        var routes = Routes("/api/*", "/api/premium/*", "/api/premium/gold");
        Assert.Equal("/api/premium/gold", RouteMatcher.FindMatchingRoute("/api/premium/gold", routes));
    }

    [Theory]
    [InlineData("/api/*", "/api/premium/*", "/api/premium/gold/*")]
    [InlineData("/api/premium/gold/*", "/api/premium/*", "/api/*")]
    [InlineData("/api/premium/*", "/api/*", "/api/premium/gold/*")]
    public void LongestWildcardPrefixWinsRegardlessOfConfigOrder(string first, string second, string third)
    {
        var routes = Routes(first, second, third);
        Assert.Equal("/api/premium/*", RouteMatcher.FindMatchingRoute("/api/premium/silver", routes));
        Assert.Equal("/api/premium/gold/*", RouteMatcher.FindMatchingRoute("/api/premium/gold/bar", routes));
        Assert.Equal("/api/*", RouteMatcher.FindMatchingRoute("/api/free", routes));
    }

    [Fact]
    public void LongestWildcardPrefixWinsRegardlessOfPrice()
    {
        var routes = new Dictionary<string, RoutePaymentConfig>
        {
            ["/api/*"] = new() { Price = "$5" },
            ["/api/premium/*"] = new() { Price = "$0.01" },
        };
        Assert.Equal("/api/premium/*", RouteMatcher.FindMatchingRoute("/api/premium/silver", routes));
    }

    [Fact]
    public void RootWildcardLosesToMoreSpecificWildcard()
    {
        var routes = Routes("/*", "/api/*");
        Assert.Equal("/api/*", RouteMatcher.FindMatchingRoute("/api/x", routes));
        Assert.Equal("/*", RouteMatcher.FindMatchingRoute("/other", routes));
    }

    [Fact]
    public void LongerWildcardDoesNotMatchAcrossSegmentBoundary()
    {
        var routes = Routes("/api/*", "/api/premium/*");
        Assert.Equal("/api/*", RouteMatcher.FindMatchingRoute("/api/premium-extra/x", routes));
    }
}
