using System.Text.Json;
using Prism.Core.Client;
using Prism.Core.Types;
using Prism.Core.Types.V2;

namespace Prism.Tests;

/// <summary>Hand-rolled IPrismClient test double — gives full control over each call's
/// behavior without a mocking framework, which matters here since PrismMiddlewareCore
/// makes a specific sequence of calls per request (requirements -> verify -> settle).</summary>
public class FakePrismClient : IPrismClient
{
    public Func<PaymentRequirementsRequest, Task<PaymentRequiredResponse>>? OnGetPaymentRequirements { get; set; }
    public Func<JsonElement, PaymentRequirements, Task<VerifyPaymentResult>>? OnVerifyPayment { get; set; }
    public Func<JsonElement, PaymentRequirements, Task<SettlePaymentResult>>? OnSettlePayment { get; set; }

    public List<PaymentRequirementsRequest> RequirementsRequests { get; } = new();
    public int VerifyCalls { get; private set; }

    public Task<AuthInfoResponse> GetAuthInfoAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(new AuthInfoResponse());

    public Task<PaymentRequiredResponse> GetPaymentRequirementsAsync(PaymentRequirementsRequest request, CancellationToken cancellationToken = default)
    {
        RequirementsRequests.Add(request);
        return OnGetPaymentRequirements?.Invoke(request)
            ?? Task.FromResult(new PaymentRequiredResponse
            {
                Resource = new ResourceInfo { Url = request.ResourceUrl },
                Accepts = new List<PaymentRequirements>
                {
                    new() { Scheme = "exact", Network = "eip155:8453", Amount = "1000000", Asset = "0xUSDC", PayTo = "0xPayTo", MaxTimeoutSeconds = 60 },
                },
            });
    }

    public Task<VerifyPaymentResult> VerifyPaymentAsync(JsonElement paymentPayload, PaymentRequirements paymentRequirements, CancellationToken cancellationToken = default)
    {
        VerifyCalls++;
        return OnVerifyPayment?.Invoke(paymentPayload, paymentRequirements)
            ?? Task.FromResult(new VerifyPaymentResult { IsValid = true, Payer = "0xPayer" });
    }

    public Task<SettlePaymentResult> SettlePaymentAsync(JsonElement paymentPayload, PaymentRequirements paymentRequirements, CancellationToken cancellationToken = default) =>
        OnSettlePayment?.Invoke(paymentPayload, paymentRequirements)
            ?? Task.FromResult(new SettlePaymentResult { Success = true, Transaction = "0xTx", Network = "eip155:8453", Payer = "0xPayer" });
}
