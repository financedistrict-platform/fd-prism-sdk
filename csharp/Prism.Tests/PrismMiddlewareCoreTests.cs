using System.Text;
using System.Text.Json;
using Prism.Core.Client;
using Prism.Core.Middleware;
using Prism.Core.Types;
using Prism.Core.Types.V2;
using Xunit;

namespace Prism.Tests;

public class PrismMiddlewareCoreTests
{
    private static string Base64(string json) => Convert.ToBase64String(Encoding.UTF8.GetBytes(json));

    private static readonly string ValidV2Header = Base64(
        "{\"x402Version\":2,\"accepted\":{\"scheme\":\"exact\",\"network\":\"eip155:8453\",\"asset\":\"0xUSDC\",\"amount\":\"1000000\",\"payTo\":\"0xPayTo\",\"maxTimeoutSeconds\":60}," +
        "\"payload\":{\"signature\":\"0xsig\",\"authorization\":{\"from\":\"0xFrom\",\"to\":\"0xPayTo\",\"value\":\"1000000\"," +
        "\"validAfter\":\"0\",\"validBefore\":\"9999999999\",\"nonce\":\"0xnonce\"}}}");

    private static readonly string ValidV1Header = Base64(
        "{\"x402Version\":1,\"scheme\":\"exact\",\"network\":\"base-sepolia\"," +
        "\"payload\":{\"signature\":\"0xsig\",\"authorization\":{\"from\":\"0xFrom\",\"to\":\"0xPayTo\",\"value\":\"1000000\"," +
        "\"validAfter\":\"0\",\"validBefore\":\"9999999999\",\"nonce\":\"0xnonce\"}}}");

    private static PrismMiddlewareConfig Config(int[]? allowedVersions = null) => new()
    {
        ApiKey = "test-key",
        BaseUrl = "https://gateway.test",
        AllowedVersions = allowedVersions,
    };

    private static Dictionary<string, RoutePaymentConfig> Routes() => new()
    {
        ["/api/premium"] = new RoutePaymentConfig { Price = "$0.01", Description = "Premium" },
    };

    [Fact]
    public async Task NoMatchingRoute_PassesThroughUnprotected()
    {
        var client = new FakePrismClient();
        var core = new PrismMiddlewareCore(Config(), Routes(), client);

        var result = await core.HandleRequestAsync(new MiddlewareRequestData { Path = "/unrelated", ResourceUrl = "https://api.test/unrelated" });

        Assert.False(result.Handled);
        Assert.Null(result.PaymentInfo);
        Assert.Empty(client.RequirementsRequests);
    }

    [Fact]
    public async Task NoPaymentHeader_Returns402WithRequirements()
    {
        var client = new FakePrismClient();
        var core = new PrismMiddlewareCore(Config(), Routes(), client);

        var result = await core.HandleRequestAsync(new MiddlewareRequestData { Path = "/api/premium", ResourceUrl = "https://api.test/api/premium" });

        Assert.True(result.Handled);
        Assert.Equal(402, result.StatusCode);
        Assert.Single(client.RequirementsRequests);
    }

    [Fact]
    public async Task MalformedPaymentPayload_Rejected400_WithoutCallingGateway()
    {
        var client = new FakePrismClient();
        var core = new PrismMiddlewareCore(Config(), Routes(), client);

        var header = Base64("{}"); // valid JSON, but fails structural shape validation

        var result = await core.HandleRequestAsync(new MiddlewareRequestData
        {
            Path = "/api/premium",
            PaymentHeader = header,
            ResourceUrl = "https://api.test/api/premium",
        });

        Assert.True(result.Handled);
        Assert.Equal(400, result.StatusCode);
        Assert.Empty(client.RequirementsRequests); // must fail before any gateway call, not after
    }

    [Fact]
    public async Task ValidV2Payment_VerifiesAndReturnsPaymentInfo()
    {
        var client = new FakePrismClient();
        var core = new PrismMiddlewareCore(Config(), Routes(), client);

        var result = await core.HandleRequestAsync(new MiddlewareRequestData
        {
            Path = "/api/premium",
            PaymentHeader = ValidV2Header,
            ResourceUrl = "https://api.test/api/premium",
            ProtocolVersion = 2,
        });

        Assert.False(result.Handled); // not handled — the protected handler is allowed to run
        Assert.NotNull(result.PaymentInfo);
        Assert.Equal("0xPayer", result.PaymentInfo!.Payer);
    }

    [Fact]
    public async Task NonWhitelistedProtocolVersion_Rejected402()
    {
        var client = new FakePrismClient();
        var core = new PrismMiddlewareCore(Config(allowedVersions: new[] { 2 }), Routes(), client);

        var result = await core.HandleRequestAsync(new MiddlewareRequestData
        {
            Path = "/api/premium",
            PaymentHeader = ValidV1Header,
            ResourceUrl = "https://api.test/api/premium",
            ProtocolVersion = 2,
        });

        Assert.True(result.Handled);
        Assert.Equal(402, result.StatusCode);
        Assert.Empty(client.RequirementsRequests);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(1)]
    public async Task V1Payload_UnderDefaultAllowedVersions_Rejected402BeforeAnyGatewayCall(int? protocolVersion)
    {
        var client = new FakePrismClient();
        var core = new PrismMiddlewareCore(Config(), Routes(), client);

        var result = await core.HandleRequestAsync(new MiddlewareRequestData
        {
            Path = "/api/premium",
            PaymentHeader = ValidV1Header,
            ResourceUrl = "https://api.test/api/premium",
            ProtocolVersion = protocolVersion,
        });

        Assert.True(result.Handled);
        Assert.Equal(402, result.StatusCode);
        Assert.Null(result.PaymentInfo);
        Assert.Empty(client.RequirementsRequests);
    }

    [Fact]
    public async Task V2Payload_WhenOnlyV1Allowed_Rejected402BeforeAnyGatewayCall()
    {
        var client = new FakePrismClient();
        var core = new PrismMiddlewareCore(Config(allowedVersions: new[] { 1 }), Routes(), client);

        var result = await core.HandleRequestAsync(new MiddlewareRequestData
        {
            Path = "/api/premium",
            PaymentHeader = ValidV2Header,
            ResourceUrl = "https://api.test/api/premium",
            ProtocolVersion = 2,
        });

        Assert.True(result.Handled);
        Assert.Equal(402, result.StatusCode);
        Assert.Null(result.PaymentInfo);
        Assert.Empty(client.RequirementsRequests);
    }

    [Fact]
    public async Task WhitelistedV1_IsAccepted_WhenExplicitlyOptedIn()
    {
        var client = new FakePrismClient
        {
            OnGetPaymentRequirements = _ => Task.FromResult(new PaymentRequiredResponse
            {
                Accepts = new List<PaymentRequirements>
                {
                    new() { Scheme = "exact", Network = "base-sepolia", Amount = "1000000", PayTo = "0xPayTo", MaxTimeoutSeconds = 60 },
                },
            }),
        };
        var core = new PrismMiddlewareCore(Config(allowedVersions: new[] { 1, 2 }), Routes(), client);

        var result = await core.HandleRequestAsync(new MiddlewareRequestData
        {
            Path = "/api/premium",
            PaymentHeader = ValidV1Header,
            ResourceUrl = "https://api.test/api/premium",
            ProtocolVersion = 2,
        });

        Assert.False(result.Handled);
        Assert.NotNull(result.PaymentInfo);
        Assert.Equal(1, result.PaymentInfo!.ProtocolVersion);
    }

    [Fact]
    public async Task VerificationFails_Returns402()
    {
        var client = new FakePrismClient
        {
            OnVerifyPayment = (_, _) => Task.FromResult(new VerifyPaymentResult { IsValid = false, Error = "signature mismatch" }),
        };
        var core = new PrismMiddlewareCore(Config(), Routes(), client);

        var result = await core.HandleRequestAsync(new MiddlewareRequestData
        {
            Path = "/api/premium",
            PaymentHeader = ValidV2Header,
            ResourceUrl = "https://api.test/api/premium",
            ProtocolVersion = 2,
        });

        Assert.True(result.Handled);
        Assert.Equal(402, result.StatusCode);
    }

    [Fact]
    public async Task SettlementCallback_SkipsGateway_WhenStatusCodeIsError()
    {
        var client = new FakePrismClient();
        var core = new PrismMiddlewareCore(Config(), Routes(), client);

        var payload = JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(ValidV2Header))).RootElement;
        var requirements = new PaymentRequirements { Scheme = "exact", Network = "eip155:8453", Amount = "1000000", Asset = "0xUSDC", PayTo = "0xPayTo" };

        var result = await core.SettlementCallbackAsync(payload, requirements, statusCode: 500);

        Assert.Null(result);
    }
}
