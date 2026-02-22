# Contributing to Prism SDK

## Publishing TypeScript Package

The TypeScript package is automatically published to GitHub Packages via GitHub Actions.

### Manual Publish via GitHub Actions

1. Go to **Actions** tab in GitHub repository
2. Select **"Publish TypeScript Package"** workflow
3. Click **"Run workflow"**
4. Select version bump type:
   - `patch` - Bug fixes (0.1.0 → 0.1.1)
   - `minor` - New features (0.1.0 → 0.2.0)
   - `major` - Breaking changes (0.1.0 → 1.0.0)
5. Click **"Run workflow"**

The workflow will:

- ✅ Run tests
- ✅ Build the package
- ✅ Bump version in package.json
- ✅ Create git tag
- ✅ Publish to GitHub Packages
- ✅ Create GitHub Release

### Local Development

```bash
cd typescript

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Test locally with npm link
npm link
cd ../your-test-project
npm link @financedistrict/prism-x402-sdk-express
```

### Version Management

Versions follow [Semantic Versioning](https://semver.org/):

- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality
- **PATCH** version for backwards-compatible bug fixes

### Package Structure

Published package includes:

```
dist/
├── index.js          # Main entry point
├── index.d.ts        # TypeScript definitions
├── middleware/       # Middleware implementation
├── client/          # Prism client
├── config/          # Configuration
└── types/           # Type definitions
```

### GitHub Packages Authentication

To install from GitHub Packages, users need to authenticate:

**Option 1: Interactive Login**

```bash
npm login --registry=https://npm.pkg.github.com --scope=@financedistrict
```

**Option 2: Using Personal Access Token**

Create `.npmrc` in your project root:

```
@financedistrict:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

**Option 3: Environment Variable**

```bash
export NPM_TOKEN=your_github_token
npm config set //npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

## Testing Before Publishing

Always test the package locally before publishing:

```bash
cd typescript

# Build
npm run build

# Run all tests
npm test

# Test example
cd examples
npm install
npm start
```

## CI/CD Pipeline

The GitHub Actions workflow runs on:

- Self-hosted runner (linux, arm64, Node.js 22)
- Manual trigger via `workflow_dispatch`
- Uses `GITHUB_TOKEN` for authentication

## Troubleshooting

### "401 Unauthorized" when publishing

Make sure:

- Repository has `packages: write` permission enabled
- Workflow has `permissions.packages: write`
- GITHUB_TOKEN is valid

### Package not found when installing

Make sure:

- `.npmrc` is configured with `@financedistrict:registry=https://npm.pkg.github.com`
- User is authenticated to GitHub Packages
- Package name matches: `@financedistrict/prism-x402-sdk-express`
