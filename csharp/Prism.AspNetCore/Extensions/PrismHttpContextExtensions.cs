using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Prism.Core.Middleware;

namespace Prism.AspNetCore.Extensions;

/// <summary>Ergonomic accessors for the verified-payment state PrismPaymentMiddleware stores on HttpContext.Items.</summary>
public static class PrismHttpContextExtensions
{
    public static PaymentInfo? GetPrismPaymentInfo(this HttpContext context)
    {
        return context.Items.TryGetValue("Prism.PaymentInfo", out var value) ? value as PaymentInfo : null;
    }

    public static JsonElement? GetPrismPayment(this HttpContext context) => context.GetPrismPaymentInfo()?.Payment;

    public static string? GetPrismPayer(this HttpContext context) => context.GetPrismPaymentInfo()?.Payer;
}
