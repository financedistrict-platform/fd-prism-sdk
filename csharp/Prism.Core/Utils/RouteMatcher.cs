using Prism.Core.Types;

namespace Prism.Core.Utils;

/// <summary>
/// Matches an incoming request path against the configured route table.
/// Mirrors typescript/packages/core/src/utils/route-matcher.ts, including the
/// path-segment-boundary fix on wildcard matching (a route "/api/*" must NOT
/// match "/api-evil" — only "/api" itself or anything under "/api/...").
/// </summary>
public static class RouteMatcher
{
    public static string? FindMatchingRoute(string path, IReadOnlyDictionary<string, RoutePaymentConfig> routes)
    {
        // Exact match first.
        if (routes.ContainsKey(path))
        {
            return path;
        }

        // Wildcard match: route "/prefix/*" matches "/prefix" itself or anything under "/prefix/".
        string? bestRoute = null;
        var bestPrefixLength = -1;
        foreach (var route in routes.Keys)
        {
            if (!route.EndsWith("/*", StringComparison.Ordinal))
            {
                continue;
            }

            var prefix = route[..^2];
            if (prefix.Length > bestPrefixLength
                && (path == prefix || path.StartsWith(prefix + "/", StringComparison.Ordinal)))
            {
                bestRoute = route;
                bestPrefixLength = prefix.Length;
            }
        }

        return bestRoute;
    }
}
