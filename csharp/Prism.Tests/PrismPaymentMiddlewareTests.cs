using System.Text;
using Microsoft.AspNetCore.Http;
using Prism.AspNetCore.Middleware;
using Prism.Core.Client;
using Prism.Core.Middleware;
using Prism.Core.Types;
using Xunit;

namespace Prism.Tests;

public class PrismPaymentMiddlewareTests
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

    private static PrismMiddlewareConfig Config(string? resourceBaseUrl = null) => new()
    {
        ApiKey = "test-key",
        BaseUrl = "https://gateway.test",
        ResourceBaseUrl = resourceBaseUrl,
    };

    private static Dictionary<string, RoutePaymentConfig> Routes() => new()
    {
        ["/api/premium"] = new RoutePaymentConfig { Price = "$0.01", Description = "Premium" },
    };

    private static DefaultHttpContext BuildContext(string path, string? paymentHeader = null, string host = "example.com")
    {
        var context = new DefaultHttpContext();
        context.Request.Scheme = "https";
        context.Request.Host = new HostString(host);
        context.Request.Path = path;
        context.Response.Body = new MemoryStream();
        if (paymentHeader is not null)
        {
            context.Request.Headers["PAYMENT-SIGNATURE"] = paymentHeader;
        }

        return context;
    }

    [Fact]
    public async Task SettlementFailure_DowngradesSuccessfulHandlerResponseTo402()
    {
        // Regression test for the exact category of bug fixed in TS (NestJS AUDIT_REPORT C-1)
        // and in Java (fire-and-forget settlement thread): a successful-looking handler response
        // must NOT reach the client if settlement subsequently fails.
        var client = new FakePrismClient
        {
            OnSettlePayment = (_, _) => Task.FromResult(new SettlePaymentResult { Success = false, ErrorReason = "insufficient funds" }),
        };
        var config = Config();
        var core = new PrismMiddlewareCore(config, Routes(), client);

        RequestDelegate next = async ctx =>
        {
            ctx.Response.StatusCode = 200;
            await ctx.Response.WriteAsync("{\"secret\":\"paid content\"}");
        };

        var middleware = new PrismPaymentMiddleware(next, config, core);
        var context = BuildContext("/api/premium", ValidV2Header);

        await middleware.InvokeAsync(context);

        context.Response.Body.Seek(0, SeekOrigin.Begin);
        var body = await new StreamReader(context.Response.Body).ReadToEndAsync();

        Assert.Equal(402, context.Response.StatusCode);
        Assert.Contains("Payment settlement failed", body);
        Assert.DoesNotContain("paid content", body); // the handler's original success body must NOT leak through
    }

    [Fact]
    public async Task V1Payment_WhenOnlyV2Allowed_Rejected402BeforeAnyGatewayCallOrHandler()
    {
        var client = new FakePrismClient();
        var config = Config();
        var core = new PrismMiddlewareCore(config, Routes(), client);
        var handlerRan = false;

        RequestDelegate next = ctx =>
        {
            handlerRan = true;
            return Task.CompletedTask;
        };

        var middleware = new PrismPaymentMiddleware(next, config, core);
        var context = BuildContext("/api/premium", ValidV1Header);

        await middleware.InvokeAsync(context);

        Assert.Equal(402, context.Response.StatusCode);
        Assert.False(handlerRan);
        Assert.Empty(client.RequirementsRequests);
    }

    [Fact]
    public async Task SettlementSuccess_PassesThroughOriginalResponse()
    {
        var client = new FakePrismClient();
        var config = Config();
        var core = new PrismMiddlewareCore(config, Routes(), client);

        RequestDelegate next = async ctx =>
        {
            ctx.Response.StatusCode = 200;
            await ctx.Response.WriteAsync("{\"secret\":\"paid content\"}");
        };

        var middleware = new PrismPaymentMiddleware(next, config, core);
        var context = BuildContext("/api/premium", ValidV2Header);

        await middleware.InvokeAsync(context);

        context.Response.Body.Seek(0, SeekOrigin.Begin);
        var body = await new StreamReader(context.Response.Body).ReadToEndAsync();

        Assert.Equal(200, context.Response.StatusCode);
        Assert.Contains("paid content", body);
        Assert.True(context.Response.Headers.ContainsKey("PAYMENT-RESPONSE"));
    }

    [Fact]
    public async Task ResourceUrl_PrefersConfiguredResourceBaseUrl_OverHostHeader()
    {
        // Regression test for the Host-header-injection gap found (and fixed) in the TS NestJS
        // and Fastify adapters (AUDIT_REPORT.md W-4/S-8).
        var client = new FakePrismClient();
        var config = Config(resourceBaseUrl: "https://real-canonical-host.test");
        var core = new PrismMiddlewareCore(config, Routes(), client);

        RequestDelegate next = _ => Task.CompletedTask;

        var middleware = new PrismPaymentMiddleware(next, config, core);
        var context = BuildContext("/api/premium", host: "attacker-spoofed-host.evil");

        await middleware.InvokeAsync(context);

        Assert.Single(client.RequirementsRequests);
        Assert.StartsWith("https://real-canonical-host.test", client.RequirementsRequests[0].ResourceUrl);
        Assert.DoesNotContain("attacker-spoofed-host", client.RequirementsRequests[0].ResourceUrl);
    }
}
