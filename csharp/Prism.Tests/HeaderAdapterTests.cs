using Prism.Core.Compatibility;
using Xunit;

namespace Prism.Tests;

public class HeaderAdapterTests
{
    [Fact]
    public void PrefersV2HeaderOverV1()
    {
        var headers = new Dictionary<string, string> { ["PAYMENT-SIGNATURE"] = "v2-payload", ["X-PAYMENT"] = "v1-payload" };
        var result = HeaderAdapter.GetPaymentPayload(name => headers.GetValueOrDefault(name));
        Assert.Equal("v2-payload", result);
    }

    [Fact]
    public void FallsBackToV1WhenV2Missing()
    {
        var headers = new Dictionary<string, string> { ["X-PAYMENT"] = "v1-payload" };
        var result = HeaderAdapter.GetPaymentPayload(name => headers.GetValueOrDefault(name));
        Assert.Equal("v1-payload", result);
    }

    [Fact]
    public void ReturnsNullWhenNeitherPresent()
    {
        Assert.Null(HeaderAdapter.GetPaymentPayload(_ => null));
    }

    [Fact]
    public void SetPaymentPayloadWritesCorrectHeaderPerVersion()
    {
        var written = new Dictionary<string, string>();

        HeaderAdapter.SetPaymentPayload((k, v) => written[k] = v, "payload", protocolVersion: 1);
        Assert.Equal("payload", written["X-PAYMENT"]);

        written.Clear();
        HeaderAdapter.SetPaymentPayload((k, v) => written[k] = v, "payload", protocolVersion: 2);
        Assert.Equal("payload", written["PAYMENT-SIGNATURE"]);
    }

    [Fact]
    public void DetectVersionFromHeadersLooksAtHeaderNamePresenceOnly()
    {
        Assert.Equal(2, HeaderAdapter.DetectVersionFromHeaders(name => name == "PAYMENT-SIGNATURE" ? "anything" : null));
        Assert.Equal(1, HeaderAdapter.DetectVersionFromHeaders(name => name == "X-PAYMENT" ? "anything" : null));
        Assert.Null(HeaderAdapter.DetectVersionFromHeaders(_ => null));
    }
}
