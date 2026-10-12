using Prism.AspNetCore.Extensions;
using Prism.Core.Types;
using Prism.Core.Utils;
using Xunit;

namespace Prism.Tests;

public class RoutesConfigBuilderTests
{
    private static RoutePaymentConfig Config(string price) => new() { Price = price };

    [Fact]
    public void BuiltRoutesAreProtectedForCaseAndTrailingSlashVariants()
    {
        var routes = new RoutesConfigBuilder()
            .AddRoute("/api/premium", Config("$0.01"))
            .Build();

        Assert.Equal("/api/premium", RouteMatcher.FindMatchingRoute("/API/premium", routes));
        Assert.Equal("/api/premium", RouteMatcher.FindMatchingRoute("/api/premium/", routes));
    }

    [Fact]
    public void BuiltRoutesLookupIgnoresCaseAndTrailingSlash()
    {
        var routes = new RoutesConfigBuilder()
            .AddRoute("/Api/Premium/", Config("$0.01"))
            .Build();

        Assert.True(routes.ContainsKey("/api/premium"));
        Assert.True(routes.ContainsKey("/API/PREMIUM"));
    }

    [Theory]
    [InlineData("/api/premium", "/API/Premium")]
    [InlineData("/api/premium", "/api/premium/")]
    [InlineData("/api/*", "/API/*/")]
    public void RoutesThatCollideAfterNormalizationAreRejected(string first, string second)
    {
        var builder = new RoutesConfigBuilder().AddRoute(first, Config("$0.01"));

        Assert.Throws<ArgumentException>(() => builder.AddRoute(second, Config("$0.02")));
    }

    [Fact]
    public void WildcardRouteBuiltByBuilderMatchesVariants()
    {
        var routes = new RoutesConfigBuilder()
            .AddRoute("/api/*", Config("$0.01"))
            .Build();

        Assert.Equal("/api/*", RouteMatcher.FindMatchingRoute("/API/", routes));
        Assert.Equal("/api/*", RouteMatcher.FindMatchingRoute("/Api/x/", routes));
    }
}
