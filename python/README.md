# Prism SDK for Python

> **Status:** 🔜 Coming Soon

A Python SDK for integrating the Prism payment gateway with Flask and FastAPI applications.

## Overview

The Prism SDK for Python will provide middleware for Flask and FastAPI to protect routes with micropayments using the x402 protocol.

## Planned Features

- ✅ Flask middleware
- ✅ FastAPI middleware
- ✅ Support for Python 3.8+
- ✅ On-demand payment requirements generation
- ✅ Cloud-hosted configuration support
- ✅ File-based configuration support
- ✅ Type hints throughout
- ✅ Async support (asyncio)
- ✅ Built-in logging
- ✅ Comprehensive docstrings

## Planned Architecture

```
prism-sdk/
├── prism_sdk/
│   ├── __init__.py
│   ├── client.py                 # PrismClient for Gateway API
│   ├── types.py                  # Type definitions
│   ├── config.py                 # Configuration classes
│   └── exceptions.py             # Custom exceptions
├── prism_flask/
│   ├── __init__.py
│   └── middleware.py             # Flask middleware
├── prism_fastapi/
│   ├── __init__.py
│   └── middleware.py             # FastAPI middleware
└── tests/
    ├── test_client.py
    ├── test_flask.py
    └── test_fastapi.py
```

## Planned Usage

### Installation

```bash
# For Flask
pip install prism-flask

# For FastAPI
pip install prism-fastapi
```

### Flask Example

```python
from flask import Flask, jsonify
from prism_flask import PrismMiddleware

app = Flask(__name__)

# Configure Prism middleware
app.wsgi_app = PrismMiddleware(
    app.wsgi_app,
    api_key='your-api-key',
    use_sandbox=True,
    routes={
        '/api/premium': {
            'price': 0.01,
            'description': 'Premium API access'
        },
        '/api/data/*': {
            'price': 0.005,
            'description': 'Data API access'
        }
    }
)

@app.route('/api/premium')
def premium():
    # Payment info available in flask.g
    payment = getattr(flask.g, 'prism_payment', None)
    return jsonify({
        'message': 'Premium content',
        'payment_nonce': payment.nonce if payment else None
    })

@app.route('/api/free')
def free():
    return jsonify({'message': 'Free content'})

if __name__ == '__main__':
    app.run()
```

### FastAPI Example

```python
from fastapi import FastAPI, Request
from prism_fastapi import PrismMiddleware

app = FastAPI()

# Add Prism middleware
app.add_middleware(
    PrismMiddleware,
    api_key='your-api-key',
    use_sandbox=True,
    routes={
        '/api/premium': {
            'price': 0.01,
            'description': 'Premium API access'
        },
        '/api/data/*': {
            'price': 0.005,
            'description': 'Data API access'
        }
    }
)

@app.get('/api/premium')
async def premium(request: Request):
    # Payment info available in request.state
    payment = getattr(request.state, 'prism_payment', None)
    return {
        'message': 'Premium content',
        'payment_nonce': payment.nonce if payment else None
    }

@app.get('/api/free')
async def free():
    return {'message': 'Free content'}
```

### Using PrismClient Directly

```python
from prism_sdk import PrismClient
import asyncio

async def main():
    client = PrismClient(
        api_key='your-api-key',
        use_sandbox=True
    )

    # Get auth info
    auth_info = await client.get_auth_info()
    print(f"Organization: {auth_info['organizationName']}")

    # Get payment requirements
    requirements = await client.get_payment_requirements(
        route='/api/premium',
        price=0.01,
        description='Premium access'
    )
    print(f"Accepted schemes: {[s['scheme'] for s in requirements['accepted']]}")

    # Verify payment
    payment_header = 'v=2;sig=0x...;rcpt=0x...;nonce=abc123'
    result = await client.verify_payment(payment_header)
    print(f"Payment valid: {result['valid']}")

asyncio.run(main())
```

### Type Hints

```python
from typing import Dict, List
from prism_sdk.types import (
    PrismMiddlewareConfig,
    PaymentRequirements,
    PaymentPayload,
    RouteConfig
)

def configure_prism(api_key: str, use_sandbox: bool) -> PrismMiddlewareConfig:
    return PrismMiddlewareConfig(
        api_key=api_key,
        use_sandbox=use_sandbox
    )

async def get_requirements(
    client: PrismClient,
    route: str,
    price: float,
    description: str
) -> PaymentRequirements:
    return await client.get_payment_requirements(route, price, description)
```

### Configuration from Environment

```python
import os
from prism_flask import PrismMiddleware

app.wsgi_app = PrismMiddleware(
    app.wsgi_app,
    api_key=os.environ['PRISM_API_KEY'],
    use_sandbox=os.environ.get('ENVIRONMENT') != 'production',
    routes={
        '/api/premium': {
            'price': float(os.environ.get('PREMIUM_PRICE', '0.01')),
            'description': 'Premium API access'
        }
    }
)
```

### Error Handling

```python
from prism_sdk.exceptions import (
    PrismAuthenticationError,
    PrismPaymentError,
    PrismGatewayError
)

try:
    requirements = await client.get_payment_requirements(
        route='/api/premium',
        price=0.01,
        description='Test'
    )
except PrismAuthenticationError as e:
    print(f"Authentication failed: {e}")
except PrismGatewayError as e:
    print(f"Gateway error: {e}")
except PrismPaymentError as e:
    print(f"Payment error: {e}")
```

## Planned Package Structure

### prism-sdk

Core types and HTTP client for Prism Gateway API.

**PyPI Package:** `prism-sdk`
**Python Version:** 3.8+
**Dependencies:**

- httpx (async HTTP client)
- pydantic (data validation)

### prism-flask

Flask middleware for Prism SDK.

**PyPI Package:** `prism-flask`
**Python Version:** 3.8+
**Dependencies:**

- prism-sdk
- flask >= 2.0

### prism-fastapi

FastAPI middleware for Prism SDK.

**PyPI Package:** `prism-fastapi`
**Python Version:** 3.8+
**Dependencies:**

- prism-sdk
- fastapi >= 0.100
- starlette >= 0.27

## Timeline

- **Q1 2026**: Initial alpha release with on-demand mode
- **Q2 2026**: Beta release with cloud/file configuration modes
- **Q3 2026**: Production-ready v1.0 release
- **Q4 2026**: Additional features (caching, metrics, etc.)

## Documentation

Once released, full documentation will be available at:

- [SDK Documentation](../../docs/introduction.md)
- [x402 Protocol](../../docs/concepts/x402-protocol.md)
- [Authentication](../../docs/concepts/authentication.md)
- [Payment Flow](../../docs/concepts/payment-flow.md)
- [Configuration Modes](../../docs/concepts/configuration-modes.md)

## Testing

```python
# Run tests
pytest

# Run with coverage
pytest --cov=prism_sdk --cov=prism_flask --cov=prism_fastapi

# Run specific test
pytest tests/test_client.py::test_get_auth_info
```

## Development

```bash
# Install in development mode
pip install -e ".[dev]"

# Run linting
flake8 prism_sdk prism_flask prism_fastapi
mypy prism_sdk prism_flask prism_fastapi

# Format code
black prism_sdk prism_flask prism_fastapi
isort prism_sdk prism_flask prism_fastapi
```

## Support

For questions or feedback, please contact:

- Email: support@1stdigital.tech
- Documentation: https://docs.prism.1stdigital.tech

## Contributing

Contributions will be welcome once the initial release is available. Please stay tuned!

## License

TBD

---

**Current Status:** Planning phase. TypeScript SDK is available now as a reference implementation.

See the [TypeScript SDK](../typescript/README.md) for a working implementation that you can use today.
