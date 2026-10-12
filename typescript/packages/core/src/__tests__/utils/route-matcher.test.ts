import { findMatchingRoute } from '../../utils/route-matcher';
import { RoutesConfig } from '../../types';

describe('findMatchingRoute', () => {
  const routes: RoutesConfig = {
    '/api/premium': { price: 0.01 },
    '/Reports/Annual/': { price: 0.02 },
    '/data/*': { price: 0.005 },
    '/Files/*': { price: 0.003 },
  };

  it('matches an exact path', () => {
    expect(findMatchingRoute('/api/premium', routes)).toBe('/api/premium');
  });

  it.each(['/API/PREMIUM', '/Api/Premium', '/api/PREMIUM'])('matches %s case-insensitively', (path) => {
    expect(findMatchingRoute(path, routes)).toBe('/api/premium');
  });

  it.each(['/api/premium/', '/api/premium//', '/API/PREMIUM/'])('ignores trailing slashes in %s', (path) => {
    expect(findMatchingRoute(path, routes)).toBe('/api/premium');
  });

  it('normalises configured route keys the same way as request paths', () => {
    expect(findMatchingRoute('/reports/annual', routes)).toBe('/Reports/Annual/');
    expect(findMatchingRoute('/REPORTS/ANNUAL/', routes)).toBe('/Reports/Annual/');
  });

  it('matches wildcard routes case-insensitively and with trailing slashes', () => {
    expect(findMatchingRoute('/DATA/users', routes)).toBe('/data/*');
    expect(findMatchingRoute('/data/users/', routes)).toBe('/data/*');
    expect(findMatchingRoute('/DATA', routes)).toBe('/data/*');
    expect(findMatchingRoute('/data/', routes)).toBe('/data/*');
    expect(findMatchingRoute('/files/Report.PDF', routes)).toBe('/Files/*');
  });

  it('does not match unrelated paths or prefix lookalikes', () => {
    expect(findMatchingRoute('/public', routes)).toBeNull();
    expect(findMatchingRoute('/api/premium-extra', routes)).toBeNull();
    expect(findMatchingRoute('/database', routes)).toBeNull();
    expect(findMatchingRoute('/api', routes)).toBeNull();
  });

  it('keeps the root path distinct from the empty path', () => {
    const rootRoutes: RoutesConfig = { '/': { price: 0.01 } };
    expect(findMatchingRoute('/', rootRoutes)).toBe('/');
    expect(findMatchingRoute('//', rootRoutes)).toBe('/');
    expect(findMatchingRoute('/other', rootRoutes)).toBeNull();
  });

  it('matches everything under a root wildcard', () => {
    const rootWildcard: RoutesConfig = { '/*': { price: 0.01 } };
    expect(findMatchingRoute('/anything/Here/', rootWildcard)).toBe('/*');
    expect(findMatchingRoute('/', rootWildcard)).toBe('/*');
  });

  it.each(['/api/*/', '/api/*//', '/API/*/'])('treats the wildcard key %s as a wildcard', (key) => {
    const slashed: RoutesConfig = { [key]: { price: 0.01 } };
    expect(findMatchingRoute('/api/users', slashed)).toBe(key);
    expect(findMatchingRoute('/API/Users/', slashed)).toBe(key);
    expect(findMatchingRoute('/api', slashed)).toBe(key);
    expect(findMatchingRoute('/api-extra', slashed)).toBeNull();
  });

  it('treats a root wildcard key with a trailing slash as a wildcard', () => {
    const rootSlashed: RoutesConfig = { '/*/': { price: 0.01 } };
    expect(findMatchingRoute('/anything/here', rootSlashed)).toBe('/*/');
  });

  it('prefers an exact match over a wildcard', () => {
    const mixed: RoutesConfig = {
      '/data/*': { price: 0.005 },
      '/data/special': { price: 0.5 },
    };
    expect(findMatchingRoute('/DATA/Special/', mixed)).toBe('/data/special');
  });
});
