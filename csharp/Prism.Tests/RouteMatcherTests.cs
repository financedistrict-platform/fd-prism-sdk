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

    [Theory]
    [InlineData("/API/premium")]
    [InlineData("/Api/Premium")]
    [InlineData("/api/premium/")]
    [InlineData("/API/PREMIUM/")]
    [InlineData("/api/premium//")]
    public void ExactRouteIgnoresCaseAndTrailingSlash(string path)
    {
        var routes = Routes("/api/premium");
        Assert.Equal("/api/premium", RouteMatcher.FindMatchingRoute(path, routes));
    }

    [Theory]
    [InlineData("/API/premium", "/api/premium/")]
    [InlineData("/api/premium", "/API/Premium/")]
    public void ConfiguredRouteIgnoresCaseAndTrailingSlash(string path, string configured)
    {
        var routes = Routes(configured);
        Assert.Equal(configured, RouteMatcher.FindMatchingRoute(path, routes));
    }

    [Theory]
    [InlineData("/API")]
    [InlineData("/API/")]
    [InlineData("/Api/Anything")]
    [InlineData("/api/anything/")]
    public void WildcardIgnoresCaseAndTrailingSlash(string path)
    {
        var routes = Routes("/api/*");
        Assert.Equal("/api/*", RouteMatcher.FindMatchingRoute(path, routes));
    }

    [Fact]
    public void NormalizationKeepsSegmentBoundary()
    {
        var routes = Routes("/api/*");
        Assert.Null(RouteMatcher.FindMatchingRoute("/API-evil/", routes));
        Assert.Null(RouteMatcher.FindMatchingRoute("/ApiFoo", routes));
    }

    [Fact]
    public void RootRouteMatchesRootPath()
    {
        var routes = Routes("/");
        Assert.Equal("/", RouteMatcher.FindMatchingRoute("/", routes));
        Assert.Null(RouteMatcher.FindMatchingRoute("/other", routes));
    }

    [Fact]
    public void ExactMatchTakesPrecedenceOverWildcardRegardlessOfCase()
    {
        var routes = Routes("/api/*", "/api/premium");
        Assert.Equal("/api/premium", RouteMatcher.FindMatchingRoute("/API/Premium/", routes));
    }

    [Fact]
    public void MatchedKeyIsUsableAgainstCaseSensitiveDictionary()
    {
        var routes = Routes("/api/premium");
        var matched = RouteMatcher.FindMatchingRoute("/API/PREMIUM/", routes);
        Assert.NotNull(matched);
        Assert.True(routes.ContainsKey(matched!));
    }
}
