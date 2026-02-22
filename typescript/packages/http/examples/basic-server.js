/**
 * Basic Node.js HTTP Server Example with Prism Payment Middleware
 * 
 * This example demonstrates how to set up a simple HTTP server with payment-protected routes.
 */

const http = require('http');
const { prismPaymentMiddleware } = require('@financedistrict/prism-x402-sdk-http');

// Configure Prism middleware
const paymentMiddleware = prismPaymentMiddleware(
  {
    // API Configuration
    apiKey: process.env.PRISM_API_KEY || 'dev-key-123',
    gatewayUrl: process.env.PRISM_GATEWAY_URL || 'https://gateway.prism.1stdigital.com',
    
    // Enable debug mode to see detailed logs (optional)
    // debug: true
  },
  {
    // Protected Routes
    '/api/premium': {
      price: 0.01, // 0.01 ETH
      description: 'Premium API access',
      mimeType: 'application/json'
    },
    '/weather': {
      price: '$0.001', // $0.001 USD worth of ETH
      description: 'Weather data access'
    },
    '/data/*': {
      price: 0.005, // Wildcard: matches /data/anything
      description: 'Data API access'
    }
  }
);

// Create HTTP server
const server = http.createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);

  // Apply Prism payment middleware
  const handled = await paymentMiddleware(req, res);

  // If middleware handled the request (returned true), we're done
  if (handled) {
    return;
  }

  // Otherwise, handle the route
  const url = require('url').parse(req.url, true);
  const pathname = url.pathname;

  // Free routes (no payment required)
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head><title>Prism Payment Demo</title></head>
        <body>
          <h1>Prism HTTP Payment Demo</h1>
          <p>This is a free route. Try these payment-protected routes:</p>
          <ul>
            <li><a href="/api/premium">/api/premium</a> - Premium API (0.01 ETH)</li>
            <li><a href="/weather">/weather</a> - Weather data ($0.001)</li>
            <li><a href="/data/users">/data/users</a> - Data API (0.005 ETH)</li>
          </ul>
          <p>Without payment, you'll receive a 402 Payment Required response with payment requirements.</p>
        </body>
      </html>
    `);
  }
  // Protected routes (payment verified by middleware)
  else if (pathname === '/api/premium') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'Welcome to Premium API!',
      payer: req.payer, // Payer address (set by middleware)
      data: {
        premium: true,
        features: ['Advanced analytics', 'Priority support', 'Custom integrations']
      }
    }, null, 2));
  }
  else if (pathname === '/weather') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      location: 'San Francisco',
      temperature: 72,
      condition: 'Sunny',
      humidity: 65,
      payer: req.payer
    }, null, 2));
  }
  else if (pathname.startsWith('/data/')) {
    const resource = pathname.split('/').pop();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      resource,
      data: ['item1', 'item2', 'item3'],
      payer: req.payer
    }, null, 2));
  }
  // 404 Not Found
  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Routes:');
  console.log('  GET /              - Free route');
  console.log('  GET /api/premium   - Requires payment (0.01 ETH)');
  console.log('  GET /weather       - Requires payment ($0.001)');
  console.log('  GET /data/*        - Requires payment (0.005 ETH)');
});
