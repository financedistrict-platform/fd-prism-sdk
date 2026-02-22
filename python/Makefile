.PHONY: install build test publish clean

# Install dependencies
install:
	cd packages/core && poetry install
	cd packages/flask && poetry install
	cd packages/fastapi && poetry install
	cd packages/django && poetry install

# Build all packages
build:
	cd packages/core && poetry build
	cd packages/flask && poetry build
	cd packages/fastapi && poetry build
	cd packages/django && poetry build

# Run tests
test:
	cd packages/core && poetry run pytest
	cd packages/flask && poetry run pytest
	cd packages/fastapi && poetry run pytest
	cd packages/django && poetry run pytest

# Publish to PyPI (requires credentials)
publish:
	cd packages/core && poetry publish
	cd packages/flask && poetry publish
	cd packages/fastapi && poetry publish
	cd packages/django && poetry publish

# Clean build artifacts
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "dist" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
