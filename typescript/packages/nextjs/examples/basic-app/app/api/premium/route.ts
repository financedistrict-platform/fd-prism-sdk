import { NextResponse } from 'next/server';
import { withPrismPayment } from '@financedistrict/prism-x402-sdk-nextjs';
import { prismConfig } from '../../../lib/prism-config';

export const GET = withPrismPayment(
  async () =>
    NextResponse.json({
      message: 'Welcome to Premium API!',
      data: {
        premium: true,
        features: ['Advanced analytics', 'Priority support', 'Custom integrations'],
      },
      timestamp: new Date().toISOString(),
    }),
  {
    price: 0.01,
    description: 'Premium API access',
  },
  prismConfig
);
