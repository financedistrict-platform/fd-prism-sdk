"""
Basic FastAPI Server Example with Prism Payment Middleware
"""

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from prism_fastapi import add_prism_middleware, get_payer
from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig

app = FastAPI(title="Prism FastAPI Demo")

# Add Prism payment middleware
add_prism_middleware(
    app,
    config=PrismMiddlewareConfig(
        api_key='dev-key-123',
        base_url='https://prism-gw.test.1stdigital.tech',
        debug=True
    ),
    routes={
        '/api/premium': RoutePaymentConfig(
            price=0.01,
            description='Premium API access'
        ),
        '/api/weather': RoutePaymentConfig(
            price='$0.001',
            description='Weather data access'
        )
    }
)


@app.get('/', response_class=HTMLResponse)
async def home():
    """Free route - no payment required"""
    return """
    <html>
        <head><title>Prism FastAPI Demo</title></head>
        <body>
            <h1>Prism FastAPI Payment Demo</h1>
            <p>This is a free route. Try these payment-protected routes:</p>
            <ul>
                <li><a href="/api/premium">/api/premium</a> - Premium API (0.01 ETH)</li>
                <li><a href="/api/weather">/api/weather</a> - Weather data ($0.001)</li>
                <li><a href="/docs">/docs</a> - OpenAPI documentation</li>
            </ul>
            <p>Without payment, you'll receive a 402 Payment Required response.</p>
        </body>
    </html>
    """


@app.get('/api/premium')
async def premium(request: Request):
    """Payment-protected premium endpoint"""
    payer = get_payer(request)
    payment = getattr(request.state, 'prism_payment', None)
    
    return {
        'message': 'Welcome to Premium API!',
        'payer': payer,
        'payment': payment,
        'data': {
            'premium': True,
            'features': [
                'Advanced analytics',
                'Priority support',
                'Custom integrations'
            ]
        }
    }


@app.get('/api/weather')
async def weather(request: Request):
    """Payment-protected weather endpoint"""
    payer = get_payer(request)
    
    return {
        'location': 'San Francisco',
        'temperature': 72,
        'condition': 'Sunny',
        'humidity': 65,
        'wind': '10 mph',
        'forecast': [
            {'day': 'Monday', 'temp': 70, 'condition': 'Partly Cloudy'},
            {'day': 'Tuesday', 'temp': 68, 'condition': 'Cloudy'},
            {'day': 'Wednesday', 'temp': 73, 'condition': 'Sunny'}
        ],
        'payer': payer
    }


if __name__ == '__main__':
    import uvicorn
    
    print('Server running on http://localhost:8000')
    print('Routes:')
    print('  GET /              - Free route')
    print('  GET /api/premium   - Requires payment (0.01 ETH)')
    print('  GET /api/weather   - Requires payment ($0.001)')
    print('  GET /docs          - OpenAPI documentation')
    
    uvicorn.run(app, host='0.0.0.0', port=8000)
