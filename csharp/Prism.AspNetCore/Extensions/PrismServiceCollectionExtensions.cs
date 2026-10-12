using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Prism.AspNetCore.Middleware;
using Prism.Core.Client;
using Prism.Core.Types;
using Prism.Core.Utils;

namespace Prism.AspNetCore.Extensions;

/// <summary>Fluent builder for the routes table passed to <c>UsePrism</c>, matching the
/// usage already documented in csharp/README.md.</summary>
public class RoutesConfigBuilder
{
    private readonly Dictionary<string, RoutePaymentConfig> _routes = new(StringComparer.OrdinalIgnoreCase);

    public RoutesConfigBuilder AddRoute(string path, RoutePaymentConfig config)
    {
        var key = RouteMatcher.NormalizePath(path);
        if (!_routes.TryAdd(key, config))
        {
            throw new ArgumentException($"Route '{path}' duplicates an already registered route; paths are compared ignoring case and trailing slashes.", nameof(path));
        }

        return this;
    }

    public IReadOnlyDictionary<string, RoutePaymentConfig> Build() => _routes;
}

public static class PrismServiceCollectionExtensions
{
    /// <summary>Registers PrismMiddlewareConfig and IPrismClient for DI (e.g. into your own services).</summary>
    public static IServiceCollection AddPrism(this IServiceCollection services, Action<PrismMiddlewareConfig> configure)
    {
        var config = new PrismMiddlewareConfig();
        configure(config);

        services.AddSingleton(config);
        services.AddSingleton<IPrismClient>(sp => new PrismClient(config, logger: sp.GetService<ILogger<PrismClient>>()));

        return services;
    }

    /// <summary>Registers the PrismPaymentMiddleware in the pipeline. Requires AddPrism to have been called first.</summary>
    public static IApplicationBuilder UsePrism(this IApplicationBuilder app, Action<RoutesConfigBuilder> configureRoutes)
    {
        var routesBuilder = new RoutesConfigBuilder();
        configureRoutes(routesBuilder);

        var config = app.ApplicationServices.GetService<PrismMiddlewareConfig>()
            ?? throw new InvalidOperationException("UsePrism requires AddPrism to be called first, e.g. builder.Services.AddPrism(options => { ... }).");

        return app.UseMiddleware<PrismPaymentMiddleware>(config, routesBuilder.Build());
    }
}
