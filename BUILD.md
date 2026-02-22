# Build & Publish Guide

## 📦 Build Commands by Language

### TypeScript

```bash
cd typescript
npm install
npm run build          # Build all packages
npm test              # Run tests

# Publish individual packages
cd packages/core
npm publish --registry https://npm.pkg.github.com

cd ../express
npm publish --registry https://npm.pkg.github.com
```

### Python

```bash
cd python

# Build all packages
make build

# Or individually
cd packages/core
poetry build           # Creates dist/prism_sdk_core-1.0.0.tar.gz and .whl
poetry publish         # Publishes to PyPI (requires credentials)

cd ../flask
poetry build
poetry publish
```

**Python Install from source:**

```bash
pip install dist/prism_sdk_core-1.0.0-py3-none-any.whl
```

### Java

```bash
cd java

# Build all modules
mvn clean install

# Package as JARs
mvn package           # Creates target/*.jar files

# Deploy to Maven repository (requires credentials)
mvn deploy -DskipTests
```

**Java Install from local:**

```bash
mvn install:install-file \
  -Dfile=target/prism-sdk-core-1.0.0-SNAPSHOT.jar \
  -DgroupId=org.fdtech.prism \
  -DartifactId=prism-sdk-core \
  -Dversion=1.0.0-SNAPSHOT \
  -Dpackaging=jar
```

---

## 🚀 Publishing

### GitHub Packages (all languages)

**1. Create GitHub Token:**

```bash
# Go to GitHub → Settings → Developer settings → Personal access tokens
# Scopes: write:packages, read:packages
```

**2. Configure credentials:**

**TypeScript (.npmrc):**

```
//npm.pkg.github.com/:_authToken=YOUR_TOKEN
@financedistrict:registry=https://npm.pkg.github.com
```

**Python (~/.pypirc):**

```ini
[distutils]
index-servers =
    github

[github]
repository = https://upload.pypi.org/legacy/
username = __token__
password = YOUR_TOKEN
```

**Java (~/.m2/settings.xml):**

```xml
<servers>
  <server>
    <id>github</id>
    <username>YOUR_USERNAME</username>
    <password>YOUR_TOKEN</password>
  </server>
</servers>
```

---

## 🔢 Versioning

All packages follow semantic versioning: `MAJOR.MINOR.PATCH`

**Update versions:**

**TypeScript:**

```bash
cd packages/core
npm version patch  # 1.0.0 → 1.0.1
```

**Python:**

```bash
# Edit pyproject.toml
version = "1.0.1"
```

**Java:**

```bash
mvn versions:set -DnewVersion=1.0.1
```

---

## ✅ Pre-publish Checklist

- [ ] All tests passing
- [ ] Version bumped
- [ ] CHANGELOG updated
- [ ] README updated
- [ ] Examples tested
- [ ] Credentials configured

---

## 📊 Build Matrix

| Language   | Build Tool  | Package Format     | Registry                        |
| ---------- | ----------- | ------------------ | ------------------------------- |
| TypeScript | npm + Turbo | `.tgz`             | npm / GitHub Packages           |
| Python     | Poetry      | `.whl` + `.tar.gz` | PyPI / GitHub Packages          |
| Java       | Maven       | `.jar`             | Maven Central / GitHub Packages |

---

## 🧪 Test Before Publish

**TypeScript:**

```bash
npm pack
npm install ./1stdigital-prism-core-1.0.0.tgz
```

**Python:**

```bash
poetry build
pip install dist/prism_sdk_core-1.0.0-py3-none-any.whl
```

**Java:**

```bash
mvn install
# Add to test project's pom.xml and verify
```
