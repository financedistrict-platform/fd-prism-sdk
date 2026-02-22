.PHONY: install build test package deploy clean

# Install dependencies (downloads Maven dependencies)
install:
	mvn dependency:resolve

# Build all modules
build:
	mvn clean compile

# Run tests
test:
	mvn test

# Package as JARs
package:
	mvn clean package

# Deploy to repository (requires credentials)
deploy:
	mvn clean deploy -DskipTests

# Clean build artifacts
clean:
	mvn clean
