---
sidebar_position: 1
---

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'

# TypeScript SDK

Express.js middleware for x402 payments.

## Installation

```bash
npm install prism-express-sdk
```

## Basic Example

```typescript
import express from "express";
import { prismPaymentMiddleware } from "prism-express-sdk";

const app = express();

app.use(
  prismPaymentMiddleware(
    {
      apiKey: "dev-key-123",
      useSandbox: true,
    },
    {
      "/api/weather": {
        price: 0.001,
        description: "Weather API access",
      },
    }
  )
);

app.get("/api/weather", (req, res) => {
  // Access payment information
  const payment = res.locals.payment;
  console.log("Payment received:", payment);

  res.json({
    location: "San Francisco",
    temperature: 72,
  });
});

app.listen(3000);
```

## Accessing Payment Information

After successful payment verification, the middleware attaches payment details to `res.locals.payment`:

```typescript
app.get("/api/weather", (req, res) => {
  const payment = res.locals.payment;

  // Payment object contains:
  // - transactionId: string
  // - amount: number
  // - blockchain: string
  // - timestamp: Date

  console.log("Payment received:", payment);

  res.json({
    location: "San Francisco",
    temperature: 72,
  });
});
```

## Features

- Route-based pricing
- Sandbox and production modes
- Payment verification
- Express middleware integration
- Access to payment details in route handlers
