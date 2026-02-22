# Production Deployment Guide

This guide covers best practices for deploying Prism SDK to production environments.

## Table of Contents

- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Environment Configuration](#environment-configuration)
- [Security Best Practices](#security-best-practices)
- [Performance Optimization](#performance-optimization)
- [Monitoring & Logging](#monitoring--logging)
- [Disaster Recovery](#disaster-recovery)

## Pre-Deployment Checklist

Before deploying to production:

- [ ] Test all protected routes in sandbox
- [ ] Test payment verification flow
- [ ] Test payment settlement flow
- [ ] Review and rotate API keys
- [ ] Set up monitoring and alerts
- [ ] Configure rate limiting
- [ ] Set up logging infrastructure
- [ ] Document runbook for incidents
- [ ] Test disaster recovery procedures
- [ ] Review security configurations

## Environment Configuration

### API Keys

**Never hardcode API keys** in your source code:

❌ **Bad:**

```typescript
const config = {
  apiKey: "prod-key-abc123", // Don't do this!
  baseUrl: 'https://prism-api.1stdigital.tech',`n          };
```

✅ **Good:**

```typescript
const config = {
  apiKey: process.env.PRISM_API_KEY,
  useSandbox: process.env.NODE_ENV !== "production",
};
```

### Environment Variables

Create environment-specific configuration:

**.env.development**

```bash
NODE_ENV=development
PRISM_API_KEY=dev-key-123
PRISM_USE_SANDBOX=true
```

**.env.production**

```bash
NODE_ENV=production
PRISM_API_KEY=prod-key-xyz789
PRISM_USE_SANDBOX=false
```

### Configuration Management

Use a configuration service for sensitive data:

**AWS Secrets Manager:**

```typescript
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

async function getPrismApiKey(): Promise<string> {
  const client = new SecretsManagerClient({ region: "us-east-1" });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: "prism/api-key" })
  );
  return JSON.parse(response.SecretString).apiKey;
}

const config = {
  apiKey: await getPrismApiKey(),
  baseUrl: 'https://prism-api.1stdigital.tech',`n          };
```

**Azure Key Vault:**

```typescript
import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

async function getPrismApiKey(): Promise<string> {
  const credential = new DefaultAzureCredential();
  const client = new SecretClient(
    "https://myvault.vault.azure.net",
    credential
  );
  const secret = await client.getSecret("prism-api-key");
  return secret.value;
}
```

## Security Best Practices

### 1. API Key Rotation

Rotate API keys regularly (every 90 days):

```typescript
// Graceful key rotation
const config = {
  apiKey: process.env.PRISM_API_KEY_CURRENT,
  fallbackApiKey: process.env.PRISM_API_KEY_PREVIOUS, // For transition period
  baseUrl: 'https://prism-api.1stdigital.tech',`n          };
```

### 2. Rate Limiting

Protect your endpoints from abuse:

```typescript
import rateLimit from "express-rate-limit";

// Rate limit payment requests
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: "Too many payment requests",
});

app.use("/api/premium", paymentLimiter);
```

### 3. Request Validation

Validate all incoming requests:

```typescript
import { body, validationResult } from "express-validator";

app.post(
  "/api/premium",
  body("data").isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // Process request
  }
);
```

### 4. HTTPS Only

**Always use HTTPS in production:**

```typescript
import https from "https";
import fs from "fs";

const options = {
  key: fs.readFileSync("/path/to/private-key.pem"),
  cert: fs.readFileSync("/path/to/certificate.pem"),
};

https.createServer(options, app).listen(443);
```

### 5. CORS Configuration

Configure CORS properly:

```typescript
import cors from "cors";

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || [],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "X-PAYMENT"],
    credentials: true,
  })
);
```

## Performance Optimization

### 1. Caching Strategy

Cache payment requirements (when using cloud/file modes):

```typescript
import NodeCache from "node-cache";

const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes

async function getCachedPaymentRequirements(route: string) {
  const cached = cache.get(route);
  if (cached) return cached;

  const requirements = await client.getPaymentRequirements(route, 0.01, "Test");
  cache.set(route, requirements);
  return requirements;
}
```

### 2. Connection Pooling

Reuse HTTP connections:

```typescript
import axios from "axios";
import http from "http";
import https from "https";

const client = axios.create({
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 50 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 }),
});
```

### 3. Async Processing

Process payments asynchronously for better throughput:

```typescript
import Bull from "bull";

const paymentQueue = new Bull("payments", {
  redis: { host: "localhost", port: 6379 },
});

paymentQueue.process(async (job) => {
  const { payment, route } = job.data;
  await client.verifyPayment(payment);
  await client.settlePayment(payment);
});

// In middleware
app.use(async (req, res, next) => {
  if (req.headers["x-payment"]) {
    // Queue payment for async verification
    await paymentQueue.add({
      payment: req.headers["x-payment"],
      route: req.path,
    });
  }
  next();
});
```

### 4. Load Balancing

Distribute traffic across multiple instances:

**Nginx configuration:**

```nginx
upstream prism_backend {
  least_conn;
  server backend1.example.com:3000;
  server backend2.example.com:3000;
  server backend3.example.com:3000;
}

server {
  listen 443 ssl;
  server_name api.example.com;

  location / {
    proxy_pass http://prism_backend;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

## Monitoring & Logging

### 1. Structured Logging

Use structured logging for better observability:

```typescript
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  defaultMeta: { service: "prism-api" },
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

// Log payment events
logger.info("Payment received", {
  route: req.path,
  paymentVersion: payment.version,
  timestamp: new Date().toISOString(),
});
```

### 2. Metrics Collection

Track key metrics:

```typescript
import { Counter, Histogram } from "prom-client";

const paymentCounter = new Counter({
  name: "prism_payments_total",
  help: "Total number of payment requests",
  labelNames: ["route", "status"],
});

const paymentDuration = new Histogram({
  name: "prism_payment_duration_seconds",
  help: "Payment verification duration",
  labelNames: ["route"],
});

// In middleware
const end = paymentDuration.startTimer({ route: req.path });
await client.verifyPayment(payment);
end();
paymentCounter.inc({ route: req.path, status: "success" });
```

### 3. Health Checks

Implement health check endpoints:

```typescript
app.get("/health", async (req, res) => {
  try {
    // Check Gateway connectivity
    await client.getAuthInfo();

    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version,
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
    });
  }
});

app.get("/ready", async (req, res) => {
  // Check if service is ready to accept traffic
  const ready = await checkDependencies();
  res.status(ready ? 200 : 503).json({ ready });
});
```

### 4. Error Tracking

Use error tracking services:

```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

// Error handler
app.use((err, req, res, next) => {
  Sentry.captureException(err);
  logger.error("Unhandled error", { error: err, path: req.path });
  res.status(500).json({ error: "Internal server error" });
});
```

## Disaster Recovery

### 1. Backup Strategy

**Configuration backups:**

```bash
# Backup configuration
aws s3 cp ./config/prism-config.json s3://backups/prism-config-$(date +%Y%m%d).json

# Scheduled backups (cron)
0 2 * * * /usr/local/bin/backup-prism-config.sh
```

### 2. Failover Configuration

**Gateway failover:**

```typescript
const config = {
  apiKey: process.env.PRISM_API_KEY,
  gatewayUrl: process.env.PRISM_GATEWAY_URL,
  fallbackGatewayUrl: process.env.PRISM_GATEWAY_FALLBACK_URL,
  baseUrl: 'https://prism-api.1stdigital.tech',`n          };

// Client with automatic failover
class ResilientPrismClient extends PrismClient {
  async getPaymentRequirements(
    route: string,
    price: number,
    description: string
  ) {
    try {
      return await super.getPaymentRequirements(route, price, description);
    } catch (error) {
      logger.warn("Primary Gateway failed, trying fallback");
      // Switch to fallback Gateway
      this.baseUrl = this.fallbackGatewayUrl;
      return await super.getPaymentRequirements(route, price, description);
    }
  }
}
```

### 3. Circuit Breaker

Prevent cascading failures:

```typescript
import CircuitBreaker from "opossum";

const breaker = new CircuitBreaker(
  async (route, price, description) => {
    return await client.getPaymentRequirements(route, price, description);
  },
  {
    timeout: 3000, // 3 seconds
    errorThresholdPercentage: 50,
    resetTimeout: 30000, // 30 seconds
  }
);

breaker.fallback(() => ({
  x402Version: 1,
  accepted: [], // Return empty requirements on failure
}));

// Use circuit breaker
const requirements = await breaker.fire(req.path, 0.01, "Test");
```

### 4. Database Backups

**Transaction logs for audit:**

```typescript
// Store payment events for audit/recovery
await db.payments.insert({
  id: payment.nonce,
  route: req.path,
  amount: 0.01,
  status: "verified",
  timestamp: new Date(),
  signature: payment.signature,
});
```

## Deployment Checklist

Final checklist before going live:

- [ ] Environment variables configured
- [ ] API keys rotated and secured
- [ ] HTTPS enabled
- [ ] Rate limiting configured
- [ ] CORS configured
- [ ] Logging configured
- [ ] Metrics collection enabled
- [ ] Error tracking enabled
- [ ] Health checks working
- [ ] Load balancer configured
- [ ] Backup strategy implemented
- [ ] Disaster recovery tested
- [ ] Documentation updated
- [ ] Team trained on runbook

## Next Steps

- [Testing Guide](./testing.md)
- [Configuration Modes](../concepts/configuration-modes.md)
- [Authentication](../concepts/authentication.md)
