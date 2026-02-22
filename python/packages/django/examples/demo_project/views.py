"""
Django views for Prism payment demo
"""

from django.http import JsonResponse, HttpResponse


def home(request):
    """Free route - no payment required"""
    html = """
    <html>
        <head><title>Prism Django Demo</title></head>
        <body>
            <h1>Prism Django Payment Demo</h1>
            <p>This is a free route. Try these payment-protected routes:</p>
            <ul>
                <li><a href="/api/premium/">/api/premium/</a> - Premium API (0.01 ETH)</li>
                <li><a href="/api/weather/">/api/weather/</a> - Weather data ($0.001)</li>
            </ul>
            <p>Without payment, you'll receive a 402 Payment Required response.</p>
        </body>
    </html>
    """
    return HttpResponse(html)


def premium(request):
    """Payment-protected premium endpoint"""
    payer = getattr(request, 'prism_payer', None)
    payment = getattr(request, 'prism_payment', None)
    
    return JsonResponse({
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


def weather(request):
    """Payment-protected weather endpoint"""
    payer = getattr(request, 'prism_payer', None)
    
    return JsonResponse({
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
