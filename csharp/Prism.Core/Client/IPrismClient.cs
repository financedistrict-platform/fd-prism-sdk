using System.Text.Json;
using Prism.Core.Types;
using Prism.Core.Types.V2;

namespace Prism.Core.Client;

/// <summary>
/// HTTP client for the Prism Gateway. Abstracted behind an interface so
/// <see cref="Middleware.PrismMiddlewareCore"/> can be tested with a fake, the direct
/// equivalent of the TS SDK's `config.client` test-injection hook.
/// </summary>
public interface IPrismClient
{
    Task<AuthInfoResponse> GetAuthInfoAsync(CancellationToken cancellationToken = default);

    Task<PaymentRequiredResponse> GetPaymentRequirementsAsync(PaymentRequirementsRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// <paramref name="paymentPayload"/> is the raw, structurally-validated-but-otherwise-untyped
    /// client payload — forwarded to the gateway byte-for-byte via JsonElement rather than a
    /// strongly-typed model, so unknown/extension fields survive the round trip.
    /// </summary>
    Task<VerifyPaymentResult> VerifyPaymentAsync(JsonElement paymentPayload, PaymentRequirements paymentRequirements, CancellationToken cancellationToken = default);

    Task<SettlePaymentResult> SettlePaymentAsync(JsonElement paymentPayload, PaymentRequirements paymentRequirements, CancellationToken cancellationToken = default);
}
