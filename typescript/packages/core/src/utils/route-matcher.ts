import { RoutesConfig } from '../types';

function normalizePath(path: string): string {
  const lower = path.toLowerCase();
  const trimmed = lower.replace(/\/+$/, '');
  return trimmed === '' && lower.startsWith('/') ? '/' : trimmed;
}

/**
 * Find matching route pattern for a given path
 *
 * Request paths and route keys are compared case-insensitively and ignoring
 * trailing slashes, matching the default routing behavior of Express and NestJS.
 *
 * Supports:
 * - Exact match: "/api/premium" (also "/API/Premium/")
 * - Wildcard match: "/api/*" matches "/api/anything"
 *
 * @param path - Request path to match
 * @param routes - Routes configuration object
 * @returns Matched route key or null if no match
 *
 * @example
 * ```typescript
 * const routes = {
 *   '/api/premium': { price: 0.01 },
 *   '/data/*': { price: 0.005 }
 * };
 *
 * findMatchingRoute('/api/premium', routes)  // '/api/premium'
 * findMatchingRoute('/API/PREMIUM/', routes) // '/api/premium'
 * findMatchingRoute('/data/users', routes)   // '/data/*'
 * findMatchingRoute('/public', routes)       // null
 * ```
 */
export function findMatchingRoute(path: string, routes: RoutesConfig): string | null {
  const normalizedPath = normalizePath(path);
  const routeKeys = Object.keys(routes);
  const patterns = routeKeys.map((route) => ({ route, pattern: normalizePath(route) }));

  for (const { route, pattern } of patterns) {
    if (!pattern.endsWith('/*') && pattern === normalizedPath) {
      return route;
    }
  }

  for (const { route, pattern } of patterns) {
    if (pattern.endsWith('/*')) {
      const prefix = normalizePath(pattern.slice(0, -2));
      if (normalizedPath === prefix || normalizedPath.startsWith(prefix + '/')) {
        return route;
      }
    }
  }

  return null;
}
