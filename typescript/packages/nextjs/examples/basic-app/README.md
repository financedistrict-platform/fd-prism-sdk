# Next.js Prism Payment Example

Basic Next.js App Router application demonstrating payment-protected API routes using `@financedistrict/prism-x402-sdk-nextjs`.

## Features

- ✅ Middleware-based payment protection for API routes
- ✅ Next.js 14+ App Router support
- ✅ TypeScript
- ✅ Multiple payment configurations (ETH and USD)
- ✅ Payment info passed via headers

## Structure

```
basic-app/
├── middleware.ts              # Prism middleware configuration
├── app/
│   ├── page.tsx              # Home page (free)
│   └── api/
│       ├── premium/
│       │   └── route.ts      # Protected route (0.01 ETH)
│       └── weather/
│           └── route.ts      # Protected route ($0.001 USD)
└── package.json
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

1. **Middleware** (`middleware.ts`):
   - Intercepts API requests matching `/api/:path*`
   - Checks for payment via `X-PAYMENT` header
   - Returns 402 if payment required
   - Passes payment info to route handlers via headers

2. **Protected Routes** (`app/api/*/route.ts`):
   - Access payment info via `request.headers.get('x-prism-payer')`
   - Return protected content
   - Settlement happens automatically after successful response

## Configuration

Edit `middleware.ts` to add more protected routes:

```typescript
export const middleware = createPrismMiddleware({
  apiKey: 'your-api-key',
  routes: {
    '/api/premium': { price: 0.01, description: 'Premium API' },
    '/api/data': { price: 0.005, description: 'Data API' },
    '/api/ai': { price: '$0.05', description: 'AI API' },
  },
});
```

## Alternative: Route-Level Protection

Instead of middleware, you can protect individual routes:

```typescript
// app/api/premium/route.ts
import { withPrismPayment } from '@financedistrict/prism-x402-sdk-nextjs';

export const GET = withPrismPayment(
  async (request: Request) => {
    return Response.json({ message: 'Premium content' });
  },
  { price: 0.01, description: 'Premium API' },
  {
    apiKey: process.env.PRISM_API_KEY || 'dev-key',
    baseUrl: process.env.PRISM_BASE_URL,
  }
);
```
