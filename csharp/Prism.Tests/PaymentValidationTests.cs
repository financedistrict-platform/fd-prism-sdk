using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Prism.Core.Client;
using Prism.Core.Middleware;
using Prism.Core.Types;
using Prism.Core.Types.V2;
using Xunit;

namespace Prism.Tests;

public class PaymentValidationTests
{
    private const string ResourceUrl = "https://api.test/api/premium";
    private const string PayTo = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
    private const string Asset = "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85";
    private const string OtherAddress = "0x2222222222222222222222222222222222222222";
    private const long NowSeconds = 1_800_000_000;

    private static readonly DateTimeOffset Now = DateTimeOffset.FromUnixTimeSeconds(NowSeconds);

    private static PaymentRequirements Requirement() => new()
    {
        Scheme = "exact",
        Network = "eip155:84532",
        Amount = "10000",
        Asset = Asset,
        PayTo = PayTo,
        MaxTimeoutSeconds = 60,
    };

    private static JsonObject Authorization() => new()
    {
        ["from"] = "0x1111111111111111111111111111111111111111",
        ["to"] = PayTo,
        ["value"] = "10000",
        ["validAfter"] = (NowSeconds - 60).ToString(),
        ["validBefore"] = (NowSeconds + 60).ToString(),
        ["nonce"] = "0xnonce",
    };

    private static JsonObject V2Payload() => new()
    {
        ["x402Version"] = 2,
        ["accepted"] = new JsonObject
        {
            ["scheme"] = "exact",
            ["network"] = "eip155:84532",
            ["amount"] = "10000",
            ["asset"] = Asset,
            ["payTo"] = PayTo,
            ["maxTimeoutSeconds"] = 60,
        },
        ["payload"] = new JsonObject
        {
            ["signature"] = "0xsig",
            ["authorization"] = Authorization(),
        },
    };

    private static JsonObject V1Payload() => new()
    {
        ["x402Version"] = 1,
        ["scheme"] = "exact",
        ["network"] = "base-sepolia",
        ["payload"] = new JsonObject
        {
            ["signature"] = "0xsig",
            ["authorization"] = Authorization(),
        },
    };

    private static JsonNode Auth(JsonObject payload) => payload["payload"]!["authorization"]!;

    private static JsonNode Accepted(JsonObject payload) => payload["accepted"]!;

    private static string Encode(JsonObject payload) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(payload.ToJsonString()));

    private sealed class Harness
    {
        public FakePrismClient Client { get; }
        public PrismMiddlewareCore Core { get; }
        public int VerifyCalls { get; private set; }
        public int SettleCalls { get; private set; }
        public PaymentRequirements? VerifiedRequirement { get; private set; }

        public Harness(PaymentRequiredResponse? requirements = null, int[]? allowedVersions = null)
        {
            Client = new FakePrismClient
            {
                OnGetPaymentRequirements = _ => Task.FromResult(requirements ?? new PaymentRequiredResponse
                {
                    Resource = new ResourceInfo { Url = ResourceUrl },
                    Accepts = new List<PaymentRequirements> { Requirement() },
                }),
                OnVerifyPayment = (_, requirement) =>
                {
                    VerifyCalls++;
                    VerifiedRequirement = requirement;
                    return Task.FromResult(new VerifyPaymentResult { IsValid = true, Payer = "0xPayer" });
                },
                OnSettlePayment = (_, _) =>
                {
                    SettleCalls++;
                    return Task.FromResult(new SettlePaymentResult { Success = true, Transaction = "0xTx" });
                },
            };

            var config = new PrismMiddlewareConfig
            {
                ApiKey = "test-key",
                BaseUrl = "https://gateway.test",
                AllowedVersions = allowedVersions,
            };
            var routes = new Dictionary<string, RoutePaymentConfig>
            {
                ["/api/premium"] = new RoutePaymentConfig { Price = "$0.01", Description = "Premium" },
            };
            Core = new PrismMiddlewareCore(config, routes, Client, utcNow: () => Now);
        }

        public Task<MiddlewareResult> Submit(JsonObject payload) =>
            Core.HandleRequestAsync(new MiddlewareRequestData
            {
                Path = "/api/premium",
                PaymentHeader = Encode(payload),
                ResourceUrl = ResourceUrl,
            });
    }

    private static async Task AssertRejectedLocally(Harness harness, JsonObject payload)
    {
        var result = await harness.Submit(payload);

        Assert.True(result.Handled);
        Assert.Equal(402, result.StatusCode);
        Assert.Null(result.PaymentInfo);
        Assert.Equal(0, harness.VerifyCalls);
        Assert.Equal(0, harness.SettleCalls);
    }

    [Fact]
    public async Task MatchingV2Payment_IsForwardedToVerifyWithTheServerBuiltRequirement()
    {
        var harness = new Harness();

        var result = await harness.Submit(V2Payload());

        Assert.False(result.Handled);
        Assert.Equal("0xPayer", result.PaymentInfo!.Payer);
        Assert.Equal(1, harness.VerifyCalls);
        Assert.Equal(PayTo, harness.VerifiedRequirement!.PayTo);
    }

    [Fact]
    public async Task AddressesDifferingOnlyByLetterCase_AreAccepted()
    {
        var harness = new Harness();
        var payload = V2Payload();
        Accepted(payload)["payTo"] = PayTo.ToLowerInvariant();
        Accepted(payload)["asset"] = Asset.ToLowerInvariant();
        Auth(payload)["to"] = PayTo.ToUpperInvariant().Replace("0X", "0x");

        var result = await harness.Submit(payload);

        Assert.False(result.Handled);
        Assert.Equal(1, harness.VerifyCalls);
    }

    [Fact]
    public async Task SelectsTheRequirementThePayloadAccepted_WhenSeveralAreOffered()
    {
        var second = Requirement();
        second.Amount = "20000";
        second.PayTo = "0xSecondPayee";
        var harness = new Harness(new PaymentRequiredResponse
        {
            Resource = new ResourceInfo { Url = ResourceUrl },
            Accepts = new List<PaymentRequirements> { Requirement(), second },
        });
        var payload = V2Payload();
        Accepted(payload)["amount"] = "20000";
        Accepted(payload)["payTo"] = "0xSecondPayee";
        Auth(payload)["to"] = "0xSecondPayee";
        Auth(payload)["value"] = "20000";

        var result = await harness.Submit(payload);

        Assert.False(result.Handled);
        Assert.Equal("0xSecondPayee", harness.VerifiedRequirement!.PayTo);
    }

    [Fact]
    public async Task AuthorizationPayingADifferentRecipient_IsRejectedLocally()
    {
        var harness = new Harness();
        var payload = V2Payload();
        Auth(payload)["to"] = OtherAddress;

        await AssertRejectedLocally(harness, payload);
    }

    [Theory]
    [InlineData("1")]
    [InlineData("10001")]
    [InlineData("1e4")]
    [InlineData("-10000")]
    public async Task AuthorizationWithADifferentValue_IsRejectedLocally(string value)
    {
        var harness = new Harness();
        var payload = V2Payload();
        Auth(payload)["value"] = value;

        await AssertRejectedLocally(harness, payload);
    }

    [Fact]
    public async Task AcceptedBlockNamingADifferentRecipient_IsRejectedLocally()
    {
        var harness = new Harness();
        var payload = V2Payload();
        Accepted(payload)["payTo"] = OtherAddress;

        await AssertRejectedLocally(harness, payload);
    }

    [Fact]
    public async Task AcceptedBlockNamingADifferentAmount_IsRejectedLocally()
    {
        var harness = new Harness();
        var payload = V2Payload();
        Accepted(payload)["amount"] = "1";
        Auth(payload)["value"] = "1";

        await AssertRejectedLocally(harness, payload);
    }

    [Fact]
    public async Task AcceptedBlockNamingADifferentAsset_IsRejectedLocally()
    {
        var harness = new Harness();
        var payload = V2Payload();
        Accepted(payload)["asset"] = OtherAddress;

        await AssertRejectedLocally(harness, payload);
    }

    [Fact]
    public async Task AcceptedBlockNamingADifferentNetwork_IsRejectedLocally()
    {
        var harness = new Harness();
        var payload = V2Payload();
        Accepted(payload)["network"] = "eip155:1";

        await AssertRejectedLocally(harness, payload);
    }

    [Theory]
    [InlineData("amount")]
    [InlineData("payTo")]
    public async Task AcceptedBlockOmittingAField_IsRejectedLocally(string field)
    {
        var harness = new Harness();
        var payload = V2Payload();
        ((JsonObject)Accepted(payload)).Remove(field);

        await AssertRejectedLocally(harness, payload);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(0)]
    public async Task ExpiredAuthorization_IsRejectedLocally(long secondsFromNow)
    {
        var harness = new Harness();
        var payload = V2Payload();
        Auth(payload)["validBefore"] = (NowSeconds + secondsFromNow).ToString();

        await AssertRejectedLocally(harness, payload);
    }

    [Fact]
    public async Task AuthorizationNotYetValid_IsRejectedLocally()
    {
        var harness = new Harness();
        var payload = V2Payload();
        Auth(payload)["validAfter"] = (NowSeconds + 1).ToString();

        await AssertRejectedLocally(harness, payload);
    }

    [Fact]
    public async Task NonNumericValidityWindow_IsRejectedLocally()
    {
        var harness = new Harness();
        var payload = V2Payload();
        Auth(payload)["validBefore"] = "soon";

        await AssertRejectedLocally(harness, payload);
    }

    [Fact]
    public async Task PayloadBoundToADifferentResource_IsRejectedLocally()
    {
        var harness = new Harness();
        var payload = V2Payload();
        payload["resource"] = new JsonObject { ["url"] = "https://api.test/api/other" };

        await AssertRejectedLocally(harness, payload);
    }

    [Fact]
    public async Task MatchingV1Payment_IsForwardedToVerify()
    {
        var requirement = Requirement();
        requirement.Network = "base-sepolia";
        var harness = new Harness(
            new PaymentRequiredResponse { Accepts = new List<PaymentRequirements> { requirement } },
            allowedVersions: new[] { 1, 2 });

        var result = await harness.Submit(V1Payload());

        Assert.False(result.Handled);
        Assert.Equal(1, harness.VerifyCalls);
    }

    [Fact]
    public async Task V1AuthorizationPayingADifferentRecipient_IsRejectedLocally()
    {
        var requirement = Requirement();
        requirement.Network = "base-sepolia";
        var harness = new Harness(
            new PaymentRequiredResponse { Accepts = new List<PaymentRequirements> { requirement } },
            allowedVersions: new[] { 1, 2 });
        var payload = V1Payload();
        Auth(payload)["to"] = OtherAddress;

        await AssertRejectedLocally(harness, payload);
    }

    [Fact]
    public async Task V1AuthorizationWithADifferentValue_IsRejectedLocally()
    {
        var requirement = Requirement();
        requirement.Network = "base-sepolia";
        var harness = new Harness(
            new PaymentRequiredResponse { Accepts = new List<PaymentRequirements> { requirement } },
            allowedVersions: new[] { 1, 2 });
        var payload = V1Payload();
        Auth(payload)["value"] = "1";

        await AssertRejectedLocally(harness, payload);
    }

    [Fact]
    public async Task SettlementCallback_SettlesAPaymentMatchingItsRequirement()
    {
        var harness = new Harness();
        var payment = JsonDocument.Parse(V2Payload().ToJsonString()).RootElement;

        var result = await harness.Core.SettlementCallbackAsync(payment, Requirement(), 200);

        Assert.True(result!.Success);
        Assert.Equal(1, harness.SettleCalls);
    }

    [Theory]
    [InlineData("recipient")]
    [InlineData("value")]
    [InlineData("accepted")]
    public async Task SettlementCallback_DoesNotCallTheGateway_ForAMismatchedPayment(string mismatch)
    {
        var harness = new Harness();
        var payload = V2Payload();
        switch (mismatch)
        {
            case "recipient":
                Auth(payload)["to"] = OtherAddress;
                break;
            case "value":
                Auth(payload)["value"] = "1";
                break;
            default:
                Accepted(payload)["amount"] = "1";
                break;
        }
        var payment = JsonDocument.Parse(payload.ToJsonString()).RootElement;

        var result = await harness.Core.SettlementCallbackAsync(payment, Requirement(), 200);

        Assert.False(result!.Success);
        Assert.Equal(0, harness.SettleCalls);
    }
}
