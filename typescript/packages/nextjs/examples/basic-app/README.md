# Next.js Prism Payment Example

Basic Next.js App Router application demonstrating payment-protected API routes using `@financedistrict/prism-x402-sdk-nextjs`.

## Features

- âœ… Route-level payment protection with settlement (`withPrismPayment`)
- âœ… Next.js 14+ App Router support
- âœ… TypeScript
- âœ… Multiple payment configurations (ETH and USD)

## Structure

```
basic-app/
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ page.tsx              # Home page (free)
â”‚   â””â”€â”€ api/
â”‚       â”œâ”€â”€ premium/
â”‚       â”‚   â””â”€â”€ route.ts      # Protected route (0.01 ETH)
â”‚       â””â”€â”€ weather/
â”‚           â””â”€â”€ route.ts      # Protected route ($0.001 USD)
â””â”€â”€ package.json
```

## Setup

1. Install dependencies:

```bash
npm install
# or
pnpm install
```

2. Set environment variables (optional):

```bash
export PRISM_API_KEY="your-api-key"
export PRISM_BASE_URL="https://prism-api.1stdigital.tech"
```

3. Run development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Routes

- `GET /` - Free home page
- `GET /api/premium` - Requires payment (0.01 ETH)
- `GET /api/weather` - Requires payment ($0.001 USD)

## Testing Payment Flow

### Without Payment

```bash
curl http://localhost:3000/api/premium
```

Response (402 Payment Required):

```json
{
  "error": "Payment Required",
  "message": "Payment required to access this resource",
  "payment": {
    "amount": "0.01",
    "currency": "ETH",
    "recipient": "0x...",
    "deadline": 1234567890
  }
}
```

### With Payment

```bash
curl http://localhost:3000/api/premium \
  -H "X-PAYMENT: eyJzaWduYXR1cmUiOiIweDEyMy4uLiJ9"
```

Response (200 OK):

```json
{
  "message": "Welcome to Premium API!",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "data": {
    "premium": true,
    "features": ["Advanced analytics", "Priority support", "Custom integrations"]
  }
}
```

## How It Works

Each paid route is wrapped with `withPrismPayment` (`app/api/*/route.ts`):

1. Without a payment header it returns 402 with the payment requirements.
2. With a payment header it verifies the proof, runs the handler, then settles the payment.
3. If settlement fails, the handler response is withheld and the client gets an error.

Next.js `middleware.ts` runs before the route handler and cannot see its response, so it cannot settle a payment. Do not use middleware to gate paid routes; a route that is not wrapped with `withPrismPayment` is not protected.

## Configuration

Shared settings live in `lib/prism-config.ts`. Price and description are set per route:

```typescript
// app/api/data/route.ts
import { withPrismPayment } from '@financedistrict/prism-x402-sdk-nextjs';
import { prismConfig } from '../../../lib/prism-config';

export const GET = withPrismPayment(
  async () => Response.json({ message: 'Data' }),
  { price: 0.005, description: 'Data API' },
  prismConfig
);
```
