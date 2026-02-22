/**
 * Basic Express Server Example with Prism Payment Middleware
 * 
 * This example demonstrates how to set up a simple Express server with payment-protected routes.
 */

const express = require('express');
const { prismPaymentMiddleware } = require('@financedistrict/prism-x402-sdk-express');

const app = express();

// Configure Prism middleware
const paymentMiddleware = prismPaymentMiddleware(
  {
    // API Configuration
    apiKey: process.env.PRISM_API_KEY || 'dev-key-123',
    baseUrl: process.env.PRISM_BASE_URL || 'https://prism-gw.test.1stdigital.tech',
    
    // Enable debug mode to see detailed logs
    debug: true  // Set to false in production
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

// Apply Prism payment middleware globally
app.use(paymentMiddleware);

// Free routes (no payment required)
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Prism Payment Demo</title></head>
      <body>
        <h1>Prism Express Payment Demo</h1>
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
});

// Protected routes (payment verified by middleware)
app.get('/api/premium', (req, res) => {
  res.json({
    message: 'Welcome to Premium API!',
    payer: req.payer, // Payer address (set by middleware)
    data: {
      premium: true,
      features: ['Advanced analytics', 'Priority support', 'Custom integrations']
    }
  });
});

app.get('/weather', (req, res) => {
  res.json({
    location: 'San Francisco',
    temperature: 72,
    condition: 'Sunny',
    humidity: 65,
    payer: req.payer
  });
});

app.get('/data/:resource', (req, res) => {
  const resource = req.params.resource;
  res.json({
    resource,
    data: ['item1', 'item2', 'item3'],
    payer: req.payer
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Routes:');
  console.log('  GET /              - Free route');
  console.log('  GET /api/premium   - Requires payment (0.01 ETH)');
  console.log('  GET /weather       - Requires payment ($0.001)');
  console.log('  GET /data/*        - Requires payment (0.005 ETH)');
});
