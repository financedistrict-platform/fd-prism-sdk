/**
 * Next.js App Router Middleware with Prism Payment Protection
 */

import { createPrismMiddleware } from '@financedistrict/prism-x402-sdk-nextjs';

export const middleware = createPrismMiddleware({
  // API Configuration
  apiKey: process.env.PRISM_API_KEY || 'dev-key-123',
  baseUrl: process.env.PRISM_BASE_URL || 'https://prism-gw.test.1stdigital.tech',

  // Protected routes
  routes: {
    '/api/premium': {
      price: 0.01, // 0.01 ETH
      description: 'Premium API access',
    },
    '/api/weather': {
      price: '$0.001', // $0.001 USD
      description: 'Weather data access',
    },
  },

  // Debug mode
  debug: true,
});

// Configure middleware matcher
export const config = {
  matcher: '/api/:path*',
};
