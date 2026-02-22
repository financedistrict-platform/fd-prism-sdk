package org.fdtech.prism.examples.spring;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Spring Boot example with Prism SDK auto-configured via application.properties.
 */
@SpringBootApplication
public class SpringBootExampleApplication {

    public static void main(String[] args) {
        SpringApplication.run(SpringBootExampleApplication.class, args);
        System.out.println("\n=== Spring Boot + Prism SDK Example ===");
        System.out.println("Server started at http://localhost:8080");
        System.out.println("\nTry these endpoints:");
        System.out.println("  - http://localhost:8080/ (public, no payment)");
        System.out.println("  - http://localhost:8080/api/premium (requires payment: 1000 wei)");
        System.out.println("  - http://localhost:8080/content/exclusive (requires payment: 500 wei)");
    }

    @RestController
    public static class ExampleController {

        @GetMapping("/")
        public Map<String, String> publicEndpoint() {
            return Map.of("message", "This is public content - no payment required");
        }

        @GetMapping("/api/premium")
        public Map<String, Object> premiumEndpoint() {
            return Map.of(
                    "message", "Welcome to premium content!",
                    "data", "Secret premium data..."
            );
        }

        @GetMapping("/content/exclusive")
        public Map<String, Object> exclusiveEndpoint() {
            return Map.of(
                    "message", "Exclusive articles",
                    "articles", new String[]{"Article 1", "Article 2", "Article 3"}
            );
        }
    }
}
