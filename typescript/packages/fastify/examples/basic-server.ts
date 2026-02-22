/**
 * Basic Fastify Server Example with Prism Payment Plugin
 * 
 * This example demonstrates how to set up a Fastify server with payment-protected routes.
 */

import Fastify from 'fastify';
import prismPlugin from '@financedistrict/prism-x402-sdk-fastify';

const app = Fastify({
  logger: true
});

// Register Prism payment plugin
await app.register(prismPlugin, {
  // API Configuration
  apiKey: process.env.PRISM_API_KEY || 'dev-key-123',
  baseUrl: process.env.PRISM_BASE_URL || 'https://prism-gw.test.1stdigital.tech',
  
  // Enable debug mode
  debug: true,
  
  // Protected Routes
  routes: {
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
});

// Extend Fastify types for payment info
declare module 'fastify' {
  interface FastifyRequest {
    payment?: any;
    payer?: string;
  }
}

// Free routes (no payment required)
app.get('/', async (request, reply) => {
  return reply.type('text/html').send(`
    <html>
      <head><title>Prism Fastify Demo</title></head>
      <body>
        <h1>Prism Fastify Payment Demo</h1>
        <p>This is a free route. Try these payment-protected routes:</p>
        <ul>
          <li><a href="/api/premium">/api/premium</a> - Premium API (0.01 ETH)</li>
          <li><a href="/weather">/weather</a> - Weather data ($0.001)</li>
          <li><a href="/data/users">/data/users</a> - Data API (0.005 ETH)</li>
        </ul>
        <p>Without payment, you'll receive a 402 Payment Required response.</p>
      </body>
    </html>
  `);
});

// Protected routes (payment verified by plugin)
app.get('/api/premium', async (request, reply) => {
  return {
    message: 'Welcome to Premium API!',
    payer: request.payer,
    data: {
      premium: true,
      features: ['Advanced analytics', 'Priority support', 'Custom integrations']
    }
  };
});

app.get('/weather', async (request, reply) => {
  return {
    location: 'San Francisco',
    temperature: 72,
    condition: 'Sunny',
    humidity: 65,
    payer: request.payer
  };
});

app.get('/data/:resource', async (request, reply) => {
  const { resource } = request.params as { resource: string };
  return {
    resource,
    data: ['item1', 'item2', 'item3'],
    payer: request.payer
  };
});

// Start server
const PORT = Number(process.env.PORT) || 3000;

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Routes:');
  console.log('  GET /              - Free route');
  console.log('  GET /api/premium   - Requires payment (0.01 ETH)');
  console.log('  GET /weather       - Requires payment ($0.001)');
  console.log('  GET /data/*        - Requires payment (0.005 ETH)');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
