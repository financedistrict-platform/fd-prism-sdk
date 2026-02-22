import { RoutesConfig } from '../types';

/**
 * Find matching route pattern for a given path
 * 
 * Supports:
 * - Exact match: "/api/premium"
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
 * findMatchingRoute('/data/users', routes)   // '/data/*'
 * findMatchingRoute('/public', routes)       // null
 * ```
 */
export function findMatchingRoute(path: string, routes: RoutesConfig): string | null {
  // Exact match first
  if (routes[path]) {
    return path;
  }

  // Wildcard matching
  for (const route in routes) {
    if (route.endsWith('/*')) {
      const prefix = route.slice(0, -2);
      if (path.startsWith(prefix)) {
        return route;
      }
    }
  }

  return null;
}
