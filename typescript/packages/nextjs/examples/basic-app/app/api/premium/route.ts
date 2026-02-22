/**
 * Premium API Route - Protected by payment
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Payment info is passed via headers from middleware
  const payer = request.headers.get('x-prism-payer');
  const payment = request.headers.get('x-prism-payment');

  return NextResponse.json({
    message: 'Welcome to Premium API!',
    payer,
    payment: payment ? JSON.parse(payment) : null,
    data: {
      premium: true,
      features: ['Advanced analytics', 'Priority support', 'Custom integrations'],
    },
    timestamp: new Date().toISOString(),
  });
}
