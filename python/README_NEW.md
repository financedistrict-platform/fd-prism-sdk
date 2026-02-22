# Prism SDK for Python

Multi-framework Python SDK for integrating the Prism payment gateway (x402 protocol).

## 🎯 Architecture

Poetry workspace monorepo with shared core logic:

```
python/
├── pyproject.toml              # Root workspace config
└── packages/
    ├── core/                   # Shared core logic
    │   └── prism_sdk_core/
    │       ├── client.py       # PrismClient
    │       └── middleware_core.py  # PrismMiddlewareCore
    ├── flask/                  # Flask middleware
    ├── fastapi/                # FastAPI middleware (async)
    └── django/                 # Django middleware
```

## 📦 Packages

| Package          | Description                      | Status         |
| ---------------- | -------------------------------- | -------------- |
| `prism-sdk-core` | Core client and middleware logic | ✅ Implemented |
| `prism-flask`    | Flask middleware                 | ✅ Implemented |
| `prism-fastapi`  | FastAPI middleware (async)       | ✅ Implemented |
| `prism-django`   | Django middleware                | ✅ Implemented |

## 🚀 Installation

### Using Poetry (recommended)

```bash
cd python
poetry install
```

### Individual packages

```bash
# Flask
pip install prism-flask

# FastAPI
pip install prism-fastapi

# Django
pip install prism-django
```

## 📖 Usage

### Flask

```python
from flask import Flask, g
from prism_flask import prism_payment_middleware
from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig

app = Flask(__name__)

prism_payment_middleware(
    app,
    PrismMiddlewareConfig(api_key='your-api-key'),
    {
        '/api/premium': RoutePaymentConfig(
            price=0.01,
            description='Premium API'
        )
    }
)

@app.route('/api/premium')
def premium():
    payer = g.prism_payer
    return {'message': 'Premium content', 'payer': payer}
```

### FastAPI

```python
from fastapi import FastAPI, Request
from prism_fastapi import add_prism_middleware, get_payer
from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig

app = FastAPI()

add_prism_middleware(
    app,
    PrismMiddlewareConfig(api_key='your-api-key'),
    {
        '/api/premium': RoutePaymentConfig(
            price=0.01,
            description='Premium API'
        )
    }
)

@app.get('/api/premium')
async def premium(request: Request):
    payer = get_payer(request)
    return {'message': 'Premium content', 'payer': payer}
```

### Django

```python
# settings.py
MIDDLEWARE = [
    ...
    'prism_django.PrismPaymentMiddleware',
]

PRISM_CONFIG = {
    'api_key': 'your-api-key',
    'base_url': 'https://prism-api.1stdigital.tech'
}

PRISM_ROUTES = {
    '/api/premium/': {
        'price': 0.01,
        'description': 'Premium API'
    }
}

# views.py
def premium(request):
    payer = request.prism_payer
    return JsonResponse({'message': 'Premium content', 'payer': payer})
```

## 🏃 Running Examples

### Flask

```bash
cd packages/flask/examples
python basic_server.py
# Visit http://localhost:5000
```

### FastAPI

```bash
cd packages/fastapi/examples
python basic_server.py
# Visit http://localhost:8000
```

### Django

```bash
cd packages/django/examples
python manage.py runserver
# Visit http://localhost:8000
```

## 🔑 Key Features

- ✅ **Shared Core Logic** - `PrismMiddlewareCore` used by all frameworks
- ✅ **Async Support** - FastAPI uses native async/await
- ✅ **Type Hints** - Full type annotations throughout
- ✅ **Framework-Native APIs** - Each integration follows framework conventions
- ✅ **Settlement Callbacks** - Automatic payment settlement after successful responses
- ✅ **Minimal Examples** - Working examples for each framework

## 🎨 Design Pattern

All framework integrations follow the **thin wrapper pattern**:

```
Framework Integration (Flask/FastAPI/Django)
    ↓
PrismMiddlewareCore (shared logic)
    ↓
PrismClient (HTTP client)
    ↓
Prism Gateway API
```

This ensures:

- **Consistent behavior** across all frameworks
- **Easy maintenance** - fix once in core, works everywhere
- **Framework-specific ergonomics** - each integration feels native

## 🆚 vs Coinbase x402

| Feature       | Prism Python SDK    | Coinbase x402 |
| ------------- | ------------------- | ------------- |
| Flask         | ✅                  | ✅            |
| FastAPI       | ✅                  | ❌            |
| Django        | ✅                  | ❌            |
| Async Support | ✅                  | ⚠️ Partial    |
| Type Hints    | ✅ Full             | ⚠️ Partial    |
| Monorepo      | ✅ Poetry workspace | ❌            |
| Core Logic    | ✅ Shared           | ❌ Duplicated |

## 🧪 Testing

```bash
# Test all packages
poetry run pytest

# Test specific package
cd packages/flask
poetry run pytest
```

## 📝 Development

```bash
# Install dependencies
poetry install

# Format code
poetry run black .

# Type check
poetry run mypy packages/

# Lint
poetry run ruff check .
```

## 📄 License

MIT
