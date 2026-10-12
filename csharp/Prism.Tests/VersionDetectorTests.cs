using System.Text;
using Prism.Core.Compatibility;
using Xunit;

namespace Prism.Tests;

public class VersionDetectorTests
{
    private static string Base64Json(string json) => Convert.ToBase64String(Encoding.UTF8.GetBytes(json));

    [Fact]
    public void DetectsExplicitV1()
    {
        Assert.Equal(1, VersionDetector.DetectProtocolVersion(Base64Json("{\"x402Version\":1,\"scheme\":\"exact\"}")));
    }

    [Fact]
    public void DetectsExplicitV2()
    {
        Assert.Equal(2, VersionDetector.DetectProtocolVersion(Base64Json("{\"x402Version\":2}")));
    }

    [Fact]
    public void DefaultsToV2WhenVersionFieldMissing()
    {
        Assert.Equal(2, VersionDetector.DetectProtocolVersion(Base64Json("{\"foo\":\"bar\"}")));
    }

    [Fact]
    public void FutureVersionDefaultsToLatestSupported()
    {
        Assert.Equal(2, VersionDetector.DetectProtocolVersion(Base64Json("{\"x402Version\":5}")));
    }

    [Fact]
    public void ReturnsNullOnTotalParseFailure()
    {
        Assert.Null(VersionDetector.DetectProtocolVersion("%%%not-base64-or-json%%%"));
    }

    [Fact]
    public void AcceptsPlainJsonNotJustBase64()
    {
        Assert.Equal(1, VersionDetector.DetectProtocolVersion("{\"x402Version\":1}"));
    }
}
