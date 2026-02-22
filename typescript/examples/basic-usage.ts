import express from 'express';
import { prismPaymentMiddleware } from '../src';

const app = express();

// Configure Prism payment middleware
app.use(prismPaymentMiddleware(
  {
    apiKey: 'dev-key-123'
  },
  {
    '/api/weather': {
      price: 0.001,
      description: 'Weather API access',
      mimeType: 'application/json'
    },
    '/api/premium/*': {
      price: 0.01,
      description: 'Premium API endpoints'
    }
  }
));

// Public endpoint (no payment required)
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Prism API' });
});

// Protected endpoint - requires payment
app.get('/api/weather', (req, res) => {
  const payment = res.locals.payment;
  console.log('Payment received:', payment);

  res.json({
    location: 'San Francisco',
    temperature: 72,
    condition: 'Sunny',
    humidity: 60
  });
});

// Protected premium endpoint - requires payment
app.get('/api/premium/data', (req, res) => {
  res.json({
    premium: true,
    data: 'This is premium content'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Try accessing http://localhost:${PORT}/api/weather`);
});
