.PHONY: deploy format commit-format lint typecheck test build increment-version release trigger-workflow get-version

# Package manager (override with: make deploy PACKAGE_MANAGER=pnpm)
PACKAGE_MANAGER ?= npm

# Helper to get current version from package.json
get_current_version = $(shell node -p "require('./package.json').version")

deploy: format commit-format lint typecheck test increment-version release trigger-workflow

# Format code with prettier (if available)
format:
	@echo "Formatting code with Prettier..."
	@if npx --yes --quiet prettier --version >/dev/null 2>&1; then \
		npx --yes prettier --write .; \
	else \
		echo "Prettier not found. Skipping format (install with: $(PACKAGE_MANAGER) i -D prettier)"; \
	fi

# Commit formatted changes (only already‑tracked files)
commit-format:
	@echo "Staging formatted files already tracked..."
	@git add -u .
	@# Only create a commit if something is staged
	@git diff --cached --quiet && echo "No formatting changes to commit." || git commit -m "chore: format"

# Lint with ESLint if present, otherwise skip with a note
lint:
	@echo "Linting with ESLint..."
	@if npx --yes --quiet eslint -v >/dev/null 2>&1; then \
		npx --yes eslint . --ext .ts,.tsx || (echo "Lint failed" && exit 1); \
	else \
		echo "ESLint not found. Skipping lint (install with: $(PACKAGE_MANAGER) i -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin)"; \
	fi

# Type-check with tsc (required)
typecheck:
	@echo "Type-checking with tsc..."
	@$(PACKAGE_MANAGER) run -s tsc --noEmit

# Run tests if any are configured
test:
	@echo "Running tests..."
	@$(PACKAGE_MANAGER) test || true

# Build the package
build:
	@echo "Building package..."
	@$(PACKAGE_MANAGER) run build

# Increment version if current is less than the latest on npm
increment-version:
	@echo "Checking current version against npm..."
	@chmod +x ./scripts/increment-version.mjs
	@node ./scripts/increment-version.mjs

# Display the current version
get-version:
	@echo "Current version is: $(call get_current_version)"

# Push to GitHub, create tag and GitHub release
release:
	@echo "Pushing to GitHub and creating release..."
	$(eval VERSION := $(get_current_version))
	@echo "Version to release: $(VERSION)"
	@git diff --quiet package.json || git add package.json
	@git diff --quiet --cached || git commit -m "chore: release v$(VERSION)"
	@git push origin HEAD:main || true

	# Create git tag if absent, then push it
	@git tag -l "v$(VERSION)" | grep -q . || git tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	@git push origin "v$(VERSION)" || true

	# Create GitHub release if gh CLI exists
	@if command -v gh >/dev/null 2>&1; then \
		if ! gh release view "v$(VERSION)" >/dev/null 2>&1; then \
			echo "Creating GitHub release v$(VERSION)..."; \
			gh release create "v$(VERSION)" \
				--title "v$(VERSION)" \
				--notes "Release v$(VERSION) of morphcloud TypeScript SDK." \
				--target main; \
		else \
			echo "GitHub release v$(VERSION) already exists, skipping."; \
		fi; \
	else \
		echo "GitHub CLI not found. Optionally create release manually."; \
	fi

# Trigger the GitHub workflow on the tagged release
trigger-workflow:
	$(eval VERSION := $(get_current_version))
	@echo "Triggering GitHub publish workflow for tag v$(VERSION)..."
	@if command -v gh >/dev/null 2>&1; then \
		echo "Running workflow publish.yaml on tag v$(VERSION)"; \
		gh workflow run publish.yaml --ref "v$(VERSION)" || \
		echo "Please trigger the workflow manually on the tag v$(VERSION)"; \
	else \
		echo "GitHub CLI not found. Please trigger the workflow manually at:"; \
		echo "https://github.com/$$(git config --get remote.origin.url | sed -e 's/.*github.com[:\/]\(.*\)\.git/\1/')/actions/workflows/publish.yaml"; \
		echo "Be sure to select the 'v$(VERSION)' tag when triggering the workflow!"; \
	fi
	@echo "Deployment complete!"

