using System.Text;
using System.Text.Json;
using Prism.Core.Client;
using Prism.Core.Middleware;
using Prism.Core.Types;
using Prism.Core.Types.V2;
using Xunit;

namespace Prism.Tests;

public class PaymentReplayGuardTests
{
    private const string Path = "/api/premium";
    private const string ResourceUrl = "https://api.test/api/premium";

    private static string Header(string nonce, string signature = "0xsig", long validBefore = 9999999999) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(
            "{\"x402Version\":2,\"accepted\":{\"scheme\":\"exact\",\"network\":\"eip155:8453\",\"asset\":\"0xUSDC\",\"amount\":\"1000000\",\"payTo\":\"0xPayTo\",\"maxTimeoutSeconds\":60}," +
            $"\"payload\":{{\"signature\":\"{signature}\",\"authorization\":{{\"from\":\"0xFrom\",\"to\":\"0xPayTo\",\"value\":\"1000000\"," +
            $"\"validAfter\":\"0\",\"validBefore\":\"{validBefore}\",\"nonce\":\"{nonce}\"}}}}}}"));

    private static PrismMiddlewareCore NewCore(FakePrismClient client, Func<DateTimeOffset>? utcNow = null) =>
        new(
            new PrismMiddlewareConfig { ApiKey = "test-key", BaseUrl = "https://gateway.test" },
            new Dictionary<string, RoutePaymentConfig> { [Path] = new() { Price = "$0.01", Description = "Premium" } },
            client,
            utcNow: utcNow);

    private static Task<MiddlewareResult> Submit(PrismMiddlewareCore core, string header) =>
        core.HandleRequestAsync(new MiddlewareRequestData
        {
            Path = Path,
            PaymentHeader = header,
            ResourceUrl = ResourceUrl,
            ProtocolVersion = 2,
        });

    private static Task<SettlePaymentResult?> Settle(PrismMiddlewareCore core, MiddlewareResult admitted, int statusCode) =>
        core.SettlementCallbackAsync(admitted.PaymentInfo!.Payment, admitted.PaymentInfo.PaymentRequirements, statusCode);

    [Fact]
    public async Task ParallelRequestsSharingOneProof_AdmitExactlyOne()
    {
        var verifyCalls = 0;
        var client = new FakePrismClient
        {
            OnVerifyPayment = async (_, _) =>
            {
                Interlocked.Increment(ref verifyCalls);
                await Task.Delay(50);
                return new VerifyPaymentResult { IsValid = true, Payer = "0xPayer" };
            },
        };
        var core = NewCore(client);
        var header = Header("0xparallel");

        var results = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => Task.Run(() => Submit(core, header))));

        Assert.Single(results, r => r.PaymentInfo is not null);
        Assert.Equal(19, results.Count(r => r.Handled && r.StatusCode == 402));
        Assert.Equal(1, verifyCalls);
    }

    [Fact]
    public async Task SecondRequestWithSameProof_IsRejectedWhileFirstIsInFlight()
    {
        var core = NewCore(new FakePrismClient());

        var first = await Submit(core, Header("0xsequential"));
        var second = await Submit(core, Header("0xsequential"));

        Assert.NotNull(first.PaymentInfo);
        Assert.True(second.Handled);
        Assert.Equal(402, second.StatusCode);
    }

    [Fact]
    public async Task DifferentSignatureOverSameAuthorization_IsTheSameProof()
    {
        var core = NewCore(new FakePrismClient());

        var first = await Submit(core, Header("0xmalleable", signature: "0xsig-a"));
        var second = await Submit(core, Header("0xmalleable", signature: "0xsig-b"));

        Assert.NotNull(first.PaymentInfo);
        Assert.True(second.Handled);
    }

    [Fact]
    public async Task DifferentNonces_DoNotBlockEachOther()
    {
        var core = NewCore(new FakePrismClient());

        var first = await Submit(core, Header("0xone"));
        var second = await Submit(core, Header("0xtwo"));

        Assert.NotNull(first.PaymentInfo);
        Assert.NotNull(second.PaymentInfo);
    }

    [Fact]
    public async Task ProofIsReleased_WhenGatewayRejectsIt()
    {
        var reject = true;
        var client = new FakePrismClient
        {
            OnVerifyPayment = (_, _) => Task.FromResult(reject
                ? new VerifyPaymentResult { IsValid = false, Error = "bad signature" }
                : new VerifyPaymentResult { IsValid = true, Payer = "0xPayer" }),
        };
        var core = NewCore(client);

        var rejected = await Submit(core, Header("0xinvalid"));
        reject = false;
        var retried = await Submit(core, Header("0xinvalid"));

        Assert.True(rejected.Handled);
        Assert.NotNull(retried.PaymentInfo);
    }

    [Fact]
    public async Task ProofIsReleased_WhenVerificationThrows()
    {
        var fail = true;
        var client = new FakePrismClient
        {
            OnVerifyPayment = (_, _) => fail
                ? throw new InvalidOperationException("gateway down")
                : Task.FromResult(new VerifyPaymentResult { IsValid = true, Payer = "0xPayer" }),
        };
        var core = NewCore(client);

        var failed = await Submit(core, Header("0xthrows"));
        fail = false;
        var retried = await Submit(core, Header("0xthrows"));

        Assert.True(failed.Handled);
        Assert.NotNull(retried.PaymentInfo);
    }

    [Fact]
    public async Task ProofIsReleased_WhenHandlerRespondsWithErrorStatus()
    {
        var client = new FakePrismClient();
        var core = NewCore(client);

        var first = await Submit(core, Header("0xhandler-error"));
        var settlement = await Settle(core, first, 500);
        var retried = await Submit(core, Header("0xhandler-error"));

        Assert.Null(settlement);
        Assert.NotNull(retried.PaymentInfo);
    }

    [Fact]
    public async Task ProofIsReleased_WhenSettlementFails()
    {
        var client = new FakePrismClient
        {
            OnSettlePayment = (_, _) => Task.FromResult(new SettlePaymentResult { Success = false, ErrorReason = "insufficient funds" }),
        };
        var core = NewCore(client);

        var first = await Submit(core, Header("0xsettle-fails"));
        await Settle(core, first, 200);
        var retried = await Submit(core, Header("0xsettle-fails"));

        Assert.NotNull(retried.PaymentInfo);
    }

    [Fact]
    public async Task ProofIsReleased_WhenSettlementThrows()
    {
        var client = new FakePrismClient
        {
            OnSettlePayment = (_, _) => throw new InvalidOperationException("gateway down"),
        };
        var core = NewCore(client);

        var first = await Submit(core, Header("0xsettle-throws"));
        var settlement = await Settle(core, first, 200);
        var retried = await Submit(core, Header("0xsettle-throws"));

        Assert.Null(settlement);
        Assert.NotNull(retried.PaymentInfo);
    }

    [Fact]
    public async Task ProofStaysConsumed_AfterSuccessfulSettlement()
    {
        var core = NewCore(new FakePrismClient());

        var first = await Submit(core, Header("0xsettled"));
        var settlement = await Settle(core, first, 200);
        var replay = await Submit(core, Header("0xsettled"));

        Assert.True(settlement!.Success);
        Assert.True(replay.Handled);
        Assert.Equal(402, replay.StatusCode);
    }

    [Fact]
    public async Task AbandonedReservation_Expires()
    {
        var now = DateTimeOffset.FromUnixTimeSeconds(1_800_000_000);
        var core = NewCore(new FakePrismClient(), () => now);
        var header = Header("0xabandoned");

        await Submit(core, header);
        var beforeExpiry = await Submit(core, header);
        now = now.AddSeconds(61);
        var afterExpiry = await Submit(core, header);

        Assert.True(beforeExpiry.Handled);
        Assert.NotNull(afterExpiry.PaymentInfo);
    }

    [Fact]
    public async Task TrackedProofs_AreBoundedAndFailClosed()
    {
        var core = NewCore(new FakePrismClient());

        var results = new List<MiddlewareResult>();
        for (var i = 0; i < 10_050; i++)
        {
            results.Add(await Submit(core, Header($"0xflood-{i}")));
        }

        Assert.Equal(10_000, results.Count(r => r.PaymentInfo is not null));
        Assert.Equal(50, results.Count(r => r.Handled));
    }

    private static PrismMiddlewareCore NewSettlingCore(FakePrismClient client) =>
        new(
            new PrismMiddlewareConfig { ApiKey = "test-key", BaseUrl = "https://gateway.test" },
            new Dictionary<string, RoutePaymentConfig> { [Path] = new() { Price = "$0.01", Description = "Premium", SettleBeforeHandler = true } },
            client);

    [Fact]
    public async Task DefaultRoutes_DoNotSettleWhileHandlingTheRequest()
    {
        var settleCalls = 0;
        var client = new FakePrismClient
        {
            OnSettlePayment = (_, _) =>
            {
                Interlocked.Increment(ref settleCalls);
                return Task.FromResult(new SettlePaymentResult { Success = true, Transaction = "0xTx" });
            },
        };

        var result = await Submit(NewCore(client), Header("0xdefault"));

        Assert.NotNull(result.PaymentInfo);
        Assert.Equal(0, settleCalls);
    }

    [Fact]
    public async Task SettleBeforeHandler_SettlesBeforeReturningControl_AndReusesTheSettlementAfterwards()
    {
        var settleCalls = 0;
        var client = new FakePrismClient
        {
            OnSettlePayment = (_, _) =>
            {
                Interlocked.Increment(ref settleCalls);
                return Task.FromResult(new SettlePaymentResult { Success = true, Transaction = "0xTx" });
            },
        };
        var core = NewSettlingCore(client);

        var admitted = await Submit(core, Header("0xsettle-first"));
        Assert.NotNull(admitted.PaymentInfo);
        Assert.Equal(1, settleCalls);

        var settlement = await Settle(core, admitted, 200);

        Assert.Equal("0xTx", settlement!.Transaction);
        Assert.Equal(1, settleCalls);
    }

    [Fact]
    public async Task SettleBeforeHandler_ParallelRequestsSettleExactlyOnce()
    {
        var settleCalls = 0;
        var client = new FakePrismClient
        {
            OnVerifyPayment = async (_, _) =>
            {
                await Task.Delay(50);
                return new VerifyPaymentResult { IsValid = true, Payer = "0xPayer" };
            },
            OnSettlePayment = (_, _) =>
            {
                Interlocked.Increment(ref settleCalls);
                return Task.FromResult(new SettlePaymentResult { Success = true, Transaction = "0xTx" });
            },
        };
        var core = NewSettlingCore(client);
        var header = Header("0xsettle-parallel");

        var results = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => Task.Run(() => Submit(core, header))));

        Assert.Single(results, r => r.PaymentInfo is not null);
        Assert.Equal(1, settleCalls);
    }

    [Fact]
    public async Task SettleBeforeHandler_RejectsTheRequestAndReleasesTheProof_WhenSettlementFails()
    {
        var fail = true;
        var client = new FakePrismClient
        {
            OnSettlePayment = (_, _) => Task.FromResult(fail
                ? new SettlePaymentResult { Success = false, ErrorReason = "insufficient funds" }
                : new SettlePaymentResult { Success = true, Transaction = "0xTx" }),
        };
        var core = NewSettlingCore(client);

        var failed = await Submit(core, Header("0xsettle-first-fails"));
        fail = false;
        var retried = await Submit(core, Header("0xsettle-first-fails"));

        Assert.True(failed.Handled);
        Assert.Equal(402, failed.StatusCode);
        Assert.Null(failed.PaymentInfo);
        Assert.NotNull(retried.PaymentInfo);
    }

    [Fact]
    public async Task SettleBeforeHandler_RejectsTheRequest_WhenSettlementThrows()
    {
        var client = new FakePrismClient
        {
            OnSettlePayment = (_, _) => throw new InvalidOperationException("gateway down"),
        };

        var failed = await Submit(NewSettlingCore(client), Header("0xsettle-first-throws"));

        Assert.True(failed.Handled);
        Assert.Equal(402, failed.StatusCode);
        Assert.Null(failed.PaymentInfo);
    }

    [Fact]
    public async Task SettleBeforeHandler_ProofStaysConsumed_WhenTheHandlerFailsAfterSettlement()
    {
        var core = NewSettlingCore(new FakePrismClient());

        var admitted = await Submit(core, Header("0xsettled-handler-fails"));
        await Settle(core, admitted, 500);
        var replay = await Submit(core, Header("0xsettled-handler-fails"));

        Assert.True(replay.Handled);
        Assert.Equal(402, replay.StatusCode);
    }
}
