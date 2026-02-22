/**
 * Home Page - Free access
 */

export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Prism Next.js Payment Demo</h1>
      <p>This is a free route. Try these payment-protected API routes:</p>
      
      <ul style={{ marginTop: '1rem' }}>
        <li style={{ marginBottom: '0.5rem' }}>
          <a href="/api/premium" style={{ color: '#0070f3' }}>
            /api/premium
          </a>
          {' - Premium API (0.01 ETH)'}
        </li>
        <li style={{ marginBottom: '0.5rem' }}>
          <a href="/api/weather" style={{ color: '#0070f3' }}>
            /api/weather
          </a>
          {' - Weather data ($0.001 USD)'}
        </li>
      </ul>

      <div style={{ 
        marginTop: '2rem', 
        padding: '1rem', 
        backgroundColor: '#f5f5f5',
        borderRadius: '8px' 
      }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
          How it works
        </h2>
        <p>
          Without payment, accessing protected routes will return a 
          <strong> 402 Payment Required</strong> response with payment details.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          Include the <code style={{ 
            backgroundColor: '#e0e0e0', 
            padding: '2px 6px', 
            borderRadius: '4px' 
          }}>X-PAYMENT</code> header with a valid payment signature to access protected content.
        </p>
      </div>
    </main>
  );
}
