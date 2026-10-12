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

  it('prefers an exact match over a wildcard', () => {
    const mixed: RoutesConfig = {
      '/data/*': { price: 0.005 },
      '/data/special': { price: 0.5 },
    };
    expect(findMatchingRoute('/DATA/Special/', mixed)).toBe('/data/special');
  });

  describe('precedence', () => {
    const cheapFirst: RoutesConfig = {
      '/api/*': { price: 0.001 },
      '/api/premium/*': { price: 0.01 },
      '/api/premium/gold/*': { price: 0.05 },
    };

    it('picks the longest wildcard prefix when a cheaper wildcard is configured first', () => {
      expect(findMatchingRoute('/api/premium/silver', cheapFirst)).toBe('/api/premium/*');
      expect(findMatchingRoute('/api/premium/gold/bar', cheapFirst)).toBe('/api/premium/gold/*');
      expect(findMatchingRoute('/api/free', cheapFirst)).toBe('/api/*');
    });

    it('does not depend on config order', () => {
      const reversed: RoutesConfig = {
        '/api/premium/gold/*': { price: 0.05 },
        '/api/premium/*': { price: 0.01 },
        '/api/*': { price: 0.001 },
      };
      expect(findMatchingRoute('/api/premium/silver', reversed)).toBe('/api/premium/*');
      expect(findMatchingRoute('/api/premium/gold/bar', reversed)).toBe('/api/premium/gold/*');
    });

    it('does not depend on price', () => {
      const expensiveBroad: RoutesConfig = {
        '/api/*': { price: 5 },
        '/api/premium/*': { price: 0.01 },
      };
      expect(findMatchingRoute('/api/premium/silver', expensiveBroad)).toBe('/api/premium/*');
    });

    it('prefers a wildcard over the root wildcard regardless of order', () => {
      const rootFirst: RoutesConfig = {
        '/*': { price: 0.001 },
        '/api/*': { price: 0.01 },
      };
      expect(findMatchingRoute('/api/x', rootFirst)).toBe('/api/*');
      expect(findMatchingRoute('/other', rootFirst)).toBe('/*');
    });

    it('applies longest prefix after case and trailing slash normalisation', () => {
      expect(findMatchingRoute('/API/Premium/Silver/', cheapFirst)).toBe('/api/premium/*');
    });

    it('lets an exact route beat every wildcard', () => {
      const withExact: RoutesConfig = {
        '/api/*': { price: 0.001 },
        '/api/premium/*': { price: 0.01 },
        '/api/premium/gold': { price: 0.05 },
      };
      expect(findMatchingRoute('/api/premium/gold', withExact)).toBe('/api/premium/gold');
    });

    it('keeps a longer wildcard from matching across a segment boundary', () => {
      expect(findMatchingRoute('/api/premium-extra/x', cheapFirst)).toBe('/api/*');
    });
  });
});
