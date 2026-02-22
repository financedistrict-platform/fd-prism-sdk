/**
 * TypeScript Node.js HTTP Server Example with Prism Payment Middleware
 * 
 * Compile: tsc typescript-server.ts
 * Run: node typescript-server.js
 */

import * as http from 'http';
import * as url from 'url';
import { prismPaymentMiddleware, PrismHttpRequest } from '@financedistrict/prism-x402-sdk-http';

// Configure Prism middleware
const paymentMiddleware = prismPaymentMiddleware(
  {
    apiKey: process.env.PRISM_API_KEY || 'dev-key-123',
    gatewayUrl: process.env.PRISM_GATEWAY_URL || 'https://gateway.prism.1stdigital.com'
  },
  {
    '/api/premium': {
      price: 0.01,
      description: 'Premium API access',
      mimeType: 'application/json'
    },
    '/weather': {
      price: '$0.001',
      description: 'Weather data access'
    },
    '/data/*': {
      price: 0.005,
      description: 'Data API access'
    }
  }
);

// Route handler interface
interface RouteHandler {
  (req: PrismHttpRequest, res: http.ServerResponse): void | Promise<void>;
}

// Route handlers
const routes: Record<string, RouteHandler> = {
  '/': (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head><title>Prism Payment Demo (TypeScript)</title></head>
        <body>
          <h1>Prism HTTP Payment Demo (TypeScript)</h1>
          <p>This is a free route. Try these payment-protected routes:</p>
          <ul>
            <li><a href="/api/premium">/api/premium</a> - Premium API (0.01 ETH)</li>
            <li><a href="/weather">/weather</a> - Weather data ($0.001)</li>
            <li><a href="/data/users">/data/users</a> - Data API (0.005 ETH)</li>
          </ul>
        </body>
      </html>
    `);
  },

  '/api/premium': (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'Welcome to Premium API!',
      payer: req.payer,
      paymentDetails: req.payment,
      data: {
        premium: true,
        features: ['Advanced analytics', 'Priority support']
      }
    }, null, 2));
  },

  '/weather': (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      location: 'San Francisco',
      temperature: 72,
      condition: 'Sunny',
      payer: req.payer
    }, null, 2));
  }
};

// Create HTTP server
const server = http.createServer(async (req: PrismHttpRequest, res: http.ServerResponse) => {
  console.log(`${req.method} ${req.url}`);

  try {
    // Apply Prism payment middleware
    const handled = await paymentMiddleware(req, res);

    // If middleware handled the request, we're done
    if (handled) {
      return;
    }

    // Parse URL
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '/';

    // Find and execute route handler
    if (routes[pathname]) {
      await routes[pathname](req, res);
    } else if (pathname.startsWith('/data/')) {
      // Handle wildcard /data/* routes
      const resource = pathname.split('/').pop();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        resource,
        data: ['item1', 'item2', 'item3'],
        payer: req.payer
      }, null, 2));
    } else {
      // 404 Not Found
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  } catch (error) {
    console.error('Server error:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }
});

// Start server
const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Routes:');
  console.log('  GET /              - Free route');
  console.log('  GET /api/premium   - Requires payment (0.01 ETH)');
  console.log('  GET /weather       - Requires payment ($0.001)');
  console.log('  GET /data/*        - Requires payment (0.005 ETH)');
});
