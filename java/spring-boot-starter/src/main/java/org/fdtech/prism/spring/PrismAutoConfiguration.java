package org.fdtech.prism.spring;

import org.fdtech.prism.core.PrismConfig;
import org.fdtech.prism.core.RoutePaymentConfig;
import org.fdtech.prism.servlet.PrismFilter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.servlet.DispatcherType;
import java.util.EnumSet;

/**
 * Auto-configuration for Prism SDK in Spring Boot applications.
 */
@Configuration
@EnableConfigurationProperties(PrismProperties.class)
@ConditionalOnProperty(name = "prism.api-key")
public class PrismAutoConfiguration {

    /**
     * Create PrismConfig from application properties.
     */
    @Bean
    public PrismConfig prismConfig(PrismProperties properties) {
        PrismConfig.Builder builder = new PrismConfig.Builder()
                .apiKey(properties.getApiKey())
                .baseUrl(properties.getBaseUrl());

        // Add routes from properties
        for (PrismProperties.RouteConfig routeConfig : properties.getRoutes()) {
            builder.addRoute(
                    routeConfig.getPath(),
                    routeConfig.getPrice(),
                    routeConfig.getDescription()
            );
        }

        return builder.build();
    }

    /**
     * Register PrismFilter with servlet container.
     */
    @Bean
    public FilterRegistrationBean<PrismFilter> prismFilterRegistration(PrismConfig prismConfig) {
        FilterRegistrationBean<PrismFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new PrismFilter(prismConfig));
        registration.addUrlPatterns("/*");
        registration.setDispatcherTypes(EnumSet.of(DispatcherType.REQUEST));
        registration.setOrder(1); // High priority
        registration.setName("prismFilter");
        return registration;
    }
}
