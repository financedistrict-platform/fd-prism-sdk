/**
 * Weather API Route - Protected by payment
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Payment info is passed via headers from middleware
  const payer = request.headers.get('x-prism-payer');

  return NextResponse.json({
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
    payer,
    timestamp: new Date().toISOString(),
  });
}
