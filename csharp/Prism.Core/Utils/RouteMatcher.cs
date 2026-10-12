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
    public static string NormalizePath(string path)
    {
        var trimmed = path.TrimEnd('/');
        return trimmed.Length == 0 ? "/" : trimmed;
    }

    public static string? FindMatchingRoute(string path, IReadOnlyDictionary<string, RoutePaymentConfig> routes)
    {
        var normalizedPath = NormalizePath(path);

        foreach (var route in routes.Keys)
        {
            if (string.Equals(NormalizePath(route), normalizedPath, StringComparison.OrdinalIgnoreCase))
            {
                return route;
            }
        }

        foreach (var route in routes.Keys)
        {
            var normalizedRoute = NormalizePath(route);
            if (!normalizedRoute.EndsWith("/*", StringComparison.Ordinal))
            {
                continue;
            }

            var prefix = normalizedRoute[..^2];
            if (string.Equals(normalizedPath, prefix, StringComparison.OrdinalIgnoreCase)
                || normalizedPath.StartsWith(prefix + "/", StringComparison.OrdinalIgnoreCase))
            {
                return route;
            }
        }

        return null;
    }
}
