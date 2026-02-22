using Microsoft.AspNetCore.Http;
using Prism.Core.Types.V1;
using Prism.Core.Types.V2;

namespace Prism.Core.Compatibility;

/// <summary>
/// Adapter for reading/writing x402 protocol headers
/// Supports both v1 and v2 header formats
/// </summary>
public static class HeaderAdapter
{
    /// <summary>
    /// Get payment payload from request headers
    /// Tries both v2 (PAYMENT-SIGNATURE) and v1 (X-PAYMENT) headers
    /// </summary>
    /// <param name="headers">HTTP request headers</param>
    /// <returns>Payment payload string (base64 encoded) or null</returns>
    public static string? GetPaymentPayload(IHeaderDictionary headers)
    {
        // Try v2 header first (current standard)
        if (headers.TryGetValue(V2Headers.PaymentSignature, out var v2Payload))
        {
            return v2Payload.ToString();
        }
        
        // Fall back to v1 header (legacy)
        if (headers.TryGetValue(V1Headers.Payment, out var v1Payload))
        {
            return v1Payload.ToString();
        }
        
        return null;
    }
    
    /// <summary>
    /// Set payment payload in response headers
    /// </summary>
    /// <param name="headers">HTTP response headers</param>
    /// <param name="payload">Payment payload (base64 encoded)</param>
    /// <param name="protocolVersion">Protocol version (1 or 2)</param>
    public static void SetPaymentPayload(IHeaderDictionary headers, string payload, int protocolVersion = 2)
    {
        if (protocolVersion == 2)
        {
            headers[V2Headers.PaymentSignature] = payload;
        }
        else
        {
            headers[V1Headers.Payment] = payload;
        }
    }
    
    /// <summary>
    /// Get settlement response from response headers
    /// Tries both v2 (PAYMENT-RESPONSE) and v1 (X-PAYMENT-RESPONSE) headers
    /// </summary>
    /// <param name="headers">HTTP response headers</param>
    /// <returns>Settlement response string (base64 encoded) or null</returns>
    public static string? GetSettlementResponse(IHeaderDictionary headers)
    {
        // Try v2 header first
        if (headers.TryGetValue(V2Headers.PaymentResponse, out var v2Response))
        {
            return v2Response.ToString();
        }
        
        // Fall back to v1 header
        if (headers.TryGetValue(V1Headers.PaymentResponse, out var v1Response))
        {
            return v1Response.ToString();
        }
        
        return null;
    }
    
    /// <summary>
    /// Set settlement response in response headers
    /// </summary>
    /// <param name="headers">HTTP response headers</param>
    /// <param name="response">Settlement response (base64 encoded)</param>
    /// <param name="protocolVersion">Protocol version (1 or 2)</param>
    public static void SetSettlementResponse(IHeaderDictionary headers, string response, int protocolVersion = 2)
    {
        if (protocolVersion == 2)
        {
            headers[V2Headers.PaymentResponse] = response;
        }
        else
        {
            headers[V1Headers.PaymentResponse] = response;
        }
    }
    
    /// <summary>
    /// Detect protocol version from request headers
    /// </summary>
    /// <param name="headers">HTTP request headers</param>
    /// <returns>Protocol version (1 or 2) or null if no payment header found</returns>
    public static int? DetectVersionFromHeaders(IHeaderDictionary headers)
    {
        // Check for v2 header
        if (headers.ContainsKey(V2Headers.PaymentSignature))
        {
            return 2;
        }
        
        // Check for v1 header
        if (headers.ContainsKey(V1Headers.Payment))
        {
            return 1;
        }
        
        return null;
    }
}
