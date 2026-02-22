"""
Basic Flask Server Example with Prism Payment Middleware
"""

from flask import Flask, g, jsonify
from prism_flask import prism_payment_middleware
from prism_sdk_core import PrismMiddlewareConfig, RoutePaymentConfig

app = Flask(__name__)

# Configure Prism middleware
prism_payment_middleware(
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


@app.route('/')
def home():
    """Free route - no payment required"""
    return '''
    <html>
        <head><title>Prism Flask Demo</title></head>
        <body>
            <h1>Prism Flask Payment Demo</h1>
            <p>This is a free route. Try these payment-protected routes:</p>
            <ul>
                <li><a href="/api/premium">/api/premium</a> - Premium API (0.01 ETH)</li>
                <li><a href="/api/weather">/api/weather</a> - Weather data ($0.001)</li>
            </ul>
            <p>Without payment, you'll receive a 402 Payment Required response.</p>
        </body>
    </html>
    '''


@app.route('/api/premium')
def premium():
    """Payment-protected premium endpoint"""
    payer = getattr(g, 'prism_payer', None)
    payment = getattr(g, 'prism_payment', None)
    
    return jsonify({
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
    })


@app.route('/api/weather')
def weather():
    """Payment-protected weather endpoint"""
    payer = getattr(g, 'prism_payer', None)
    
    return jsonify({
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
    })


if __name__ == '__main__':
    print('Server running on http://localhost:5000')
    print('Routes:')
    print('  GET /              - Free route')
    print('  GET /api/premium   - Requires payment (0.01 ETH)')
    print('  GET /api/weather   - Requires payment ($0.001)')
    app.run(debug=True, port=5000)
