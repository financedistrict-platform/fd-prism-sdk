import { NextResponse } from 'next/server';
import { withPrismPayment } from '@financedistrict/prism-x402-sdk-nextjs';
import { prismConfig } from '../../../lib/prism-config';

export const GET = withPrismPayment(
  async () =>
    NextResponse.json({
      location: 'San Francisco',
      temperature: 72,
      condition: 'Sunny',
      humidity: 65,
      wind: '10 mph',
      forecast: [
        { day: 'Monday', temp: 70, condition: 'Partly Cloudy' },
        { day: 'Tuesday', temp: 68, condition: 'Cloudy' },
        { day: 'Wednesday', temp: 73, condition: 'Sunny' },
      ],
      timestamp: new Date().toISOString(),
    }),
  {
    price: '$0.001',
    description: 'Weather data access',
  },
  prismConfig
);
