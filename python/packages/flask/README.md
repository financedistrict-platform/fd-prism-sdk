# prism-flask

Flask middleware for the Prism x402 payment protocol. Protects routes with a `402 Payment Required` challenge, verifies payment proofs against the Prism Gateway and settles after a successful response.

```python
from flask import Flask
from prism_flask import prism_payment_middleware
from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig

app = Flask(__name__)
prism_payment_middleware(
    app,
    PrismMiddlewareConfig(api_key="your-api-key"),
    {"/api/premium": RoutePaymentConfig(price=0.01, description="Premium API")},
)
```

See the [Python SDK guide](../../README.md) for the full reference.
