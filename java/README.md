# FD Prism SDK - Java

Java implementation of the FD Prism SDK for HTTP 402 Payment Required handling.

## 📦 Packages

- **`core`** - Core logic (HTTP client, middleware, configuration)
- **`servlet`** - Generic servlet filter for any servlet-based application
- **`spring-boot-starter`** - Spring Boot auto-configuration

## 🚀 Quick Start

### Servlet (Tomcat, Jetty, etc.)

```java
import org.fdtech.prism.core.PrismConfig;
import org.fdtech.prism.servlet.PrismFilter;

// 1. Configure Prism
PrismConfig config = new PrismConfig.Builder()
    .apiKey("your-api-key")
    .baseUrl("https://prism-gw.test.1stdigital.tech")
    .addRoute("/api/premium", 1000L, "Premium content")
    .build();

// 2. Register filter
PrismFilter filter = new PrismFilter(config);
servletContext.addFilter("prismFilter", filter)
    .addMappingForUrlPatterns(EnumSet.of(DispatcherType.REQUEST), true, "/*");
```

### Spring Boot

**1. Add dependency:**

```xml
<dependency>
    <groupId>org.fdtech.prism</groupId>
    <artifactId>prism-spring-boot-starter</artifactId>
    <version>1.0.1-SNAPSHOT</version>
</dependency>
```

**2. Configure in `application.properties`:**

```properties
prism.api-key=your-api-key
prism.base-url=https://prism-gw.test.1stdigital.tech

prism.routes[0].path=/api/premium
prism.routes[0].price=1000
prism.routes[0].description=Premium content

prism.routes[1].path=/content/exclusive
prism.routes[1].price=500
prism.routes[1].description=Exclusive content
```

**3. That's it!** Auto-configuration handles everything.

## 📂 Project Structure

```
java/
├── core/                      # Core logic
│   └── src/main/java/org/fdtech/prism/core/
│       ├── PrismClient.java       # HTTP client
│       ├── PrismMiddleware.java   # Core logic
│       ├── PrismConfig.java       # Configuration
│       ├── RoutePaymentConfig.java
│       └── PrismResponse.java
│
├── servlet/                   # Servlet filter
│   └── src/main/java/org/fdtech/prism/servlet/
│       └── PrismFilter.java
│
├── spring-boot-starter/       # Spring Boot auto-config
│   └── src/main/java/org/fdtech/prism/spring/
│       ├── PrismAutoConfiguration.java
│       └── PrismProperties.java
│
└── examples/
    ├── servlet-example/       # Raw servlet + Jetty
    └── spring-boot-example/   # Spring Boot app
```

## 🏗️ Build

```bash
# Build all modules
mvn clean install

# Build specific module
cd core && mvn clean install

# Run servlet example
cd examples/servlet-example
mvn exec:java -Dexec.mainClass="org.fdtech.prism.examples.servlet.BasicServletExample"

# Run Spring Boot example
cd examples/spring-boot-example
mvn spring-boot:run
```

## 🔑 Key Features

- ✅ **Framework agnostic core** - Same logic everywhere
- ✅ **Servlet filter** - Works with any servlet container
- ✅ **Spring Boot auto-config** - Zero code configuration
- ✅ **Type-safe configuration** - Builder pattern
- ✅ **Route matching** - Normalized paths, prefix matching on segment boundaries
- ✅ **Route-bound proofs** - Every proof is verified and settled against the matched route
- ✅ **Settlement callbacks** - Synchronous; the response is held until settlement succeeds

## 📖 API Reference

### PrismConfig

```java
PrismConfig config = new PrismConfig.Builder()
    .apiKey("your-api-key")              // Required
    .baseUrl("https://...")              // Optional (has default)
    .addRoute("/path", price, "desc")    // Add routes
    .build();
```

### RoutePaymentConfig

```java
RoutePaymentConfig route = new RoutePaymentConfig(
    "/api/premium",        // Path
    1000L,                 // Price in wei (long)
    "Premium access"       // Description
);
```

### Route matching

Routes are matched against `getServletPath() + getPathInfo()` (container-decoded, without the context path or `;params`), then normalized again:

- percent-decoding is repeated until stable, `;params`, `//`, `.` and `..` segments are removed, `\` is treated as `/`, and matching is case-insensitive
- a route matches its own path and every path below it on a segment boundary (`/api/premium` matches `/api/premium/1`, not `/api/premiumness`); the longest route wins
- `/api/data/*` is the same as `/api/data`; a `*` anywhere else, or two routes that normalize to the same path, fail at startup
- paths with control characters (such as an encoded NUL) get `400`
- requests that match no route are passed through untouched; the `Authorization` header is never sent to the Gateway for them

Route paths are relative to the context path, so a route for `/api/premium` also protects `/myapp/api/premium` when the app is deployed under `/myapp`.

### Payment proofs

The Gateway receives the matched route's `resource`, `price` and `description` (built on the server from `RoutePaymentConfig`, never from the request) with every `verify-payment` and `settlement-callback` call, so a proof is only accepted for the route it was issued for. Settlement runs before any response byte is sent; if it fails the client gets `402` instead of the content.

`PrismMiddleware.handleRequest` returns a `PrismDecision` (respond, continue unprotected, or verified and awaiting `settle`).

### PrismFilter (Servlet)

```java
PrismFilter filter = new PrismFilter(config);
servletContext.addFilter("prismFilter", filter)
    .addMappingForUrlPatterns(EnumSet.of(DispatcherType.REQUEST), true, "/*");
```

## 🧪 Testing

```bash
# Run tests
mvn test

# Run tests with coverage
mvn test jacoco:report
```

## 📝 License

MIT
