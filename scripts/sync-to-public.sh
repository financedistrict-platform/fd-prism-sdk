#!/usr/bin/env bash
#
# sync-to-public.sh
#
# Syncs master branch to public-release with package rename:
#   @1stdigital/prism-*  →  @financedistrict/prism-x402-sdk-*
#
# Usage:
#   ./scripts/sync-to-public.sh                        # default commit message
#   ./scripts/sync-to-public.sh "fix: three protocol bugs"  # custom message
#   ./scripts/sync-to-public.sh --push                 # sync + push to public remote
#
# What it does:
#   1. Checks out public-release branch
#   2. Replaces all tracked files with master's files
#   3. Renames @1stdigital → @financedistrict in all relevant files
#   4. Commits as a single squash commit
#   5. Switches back to your original branch
#
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────
SOURCE_BRANCH="master"
TARGET_BRANCH="public-release"
PUBLIC_REMOTE="public"
PUSH=false
COMMIT_MSG=""

# ── Parse args ──────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --push)   PUSH=true; shift ;;
    --source) SOURCE_BRANCH="$2"; shift 2 ;;
    *)        COMMIT_MSG="$1"; shift ;;
  esac
done

if [[ -z "$COMMIT_MSG" ]]; then
  # Auto-generate from latest master commit
  SHORT_SHA=$(git rev-parse --short "$SOURCE_BRANCH")
  MASTER_MSG=$(git log -1 --format="%s" "$SOURCE_BRANCH")
  COMMIT_MSG="sync: ${MASTER_MSG} (from ${SOURCE_BRANCH}@${SHORT_SHA})"
fi

# ── Pre-flight checks ──────────────────────────────────────────────
CURRENT_BRANCH=$(git branch --show-current)

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "❌ Working directory is not clean. Commit or stash your changes first."
  exit 1
fi

if ! git rev-parse --verify "$TARGET_BRANCH" >/dev/null 2>&1; then
  echo "❌ Branch '$TARGET_BRANCH' does not exist."
  exit 1
fi

if ! git rev-parse --verify "$SOURCE_BRANCH" >/dev/null 2>&1; then
  echo "❌ Branch '$SOURCE_BRANCH' does not exist."
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Sync: $SOURCE_BRANCH → $TARGET_BRANCH"
echo "║  Message: $COMMIT_MSG"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Switch to public-release ────────────────────────────────
echo "→ Switching to $TARGET_BRANCH..."
git checkout "$TARGET_BRANCH"

# ── Step 2: Remove all tracked files ────────────────────────────────
echo "→ Clearing working tree..."
git rm -rf . >/dev/null 2>&1 || true

# ── Step 3: Copy all files from master ──────────────────────────────
echo "→ Copying files from $SOURCE_BRANCH..."
git checkout "$SOURCE_BRANCH" -- .

# Reset the staging area so we can re-add after renaming
git reset HEAD . >/dev/null 2>&1 || true

# ── Step 4: Rename packages ────────────────────────────────────────
echo "→ Renaming @1stdigital → @financedistrict..."

# File extensions to process
RENAME_PATTERN='\.(ts|js|json|md|mdx|yml|yaml|toml|py|java|cs)$'

# Find all relevant files (exclude build artifacts)
find . -type f -regextype posix-extended -regex ".*${RENAME_PATTERN}" \
  ! -path './node_modules/*' \
  ! -path '*/node_modules/*' \
  ! -path '*/dist/*' \
  ! -path '*/target/*' \
  ! -path './.git/*' \
  ! -path '*/__pycache__/*' \
  -print0 | while IFS= read -r -d '' file; do

  # Order matters: specific (longer) names first, then generic
  sed -i \
    -e 's/@1stdigital\/prism-express/@financedistrict\/prism-x402-sdk-express/g' \
    -e 's/@1stdigital\/prism-fastify/@financedistrict\/prism-x402-sdk-fastify/g' \
    -e 's/@1stdigital\/prism-http/@financedistrict\/prism-x402-sdk-http/g' \
    -e 's/@1stdigital\/prism-nestjs/@financedistrict\/prism-x402-sdk-nestjs/g' \
    -e 's/@1stdigital\/prism-nextjs/@financedistrict\/prism-x402-sdk-nextjs/g' \
    -e 's/@1stdigital\/prism-sdk-monorepo/@financedistrict\/prism-x402-sdk-monorepo/g' \
    -e 's/@1stdigital\/prism-core/@financedistrict\/prism-x402-sdk/g' \
    -e 's/@1stdigital:registry/@financedistrict:registry/g' \
    -e 's/scope=@1stdigital/scope=@financedistrict/g' \
    -e 's/scope: "@1stdigital"/scope: "@financedistrict"/g' \
    "$file"
done

# ── Step 5: Stage and commit ────────────────────────────────────────
echo "→ Staging changes..."
git add -A

# Check if there are actual changes
if git diff --cached --quiet; then
  echo "⚠️  No changes to commit. Public release is already up to date."
  git checkout "$CURRENT_BRANCH"
  exit 0
fi

echo "→ Committing..."
git commit -m "$COMMIT_MSG"

# ── Step 6: Optionally push ────────────────────────────────────────
if [[ "$PUSH" == true ]]; then
  echo "→ Pushing to $PUBLIC_REMOTE..."
  git push "$PUBLIC_REMOTE" "$TARGET_BRANCH:main"
  echo "✅ Pushed to $PUBLIC_REMOTE/main"
fi

# ── Step 7: Switch back ────────────────────────────────────────────
echo "→ Switching back to $CURRENT_BRANCH..."
git checkout "$CURRENT_BRANCH"

echo ""
echo "✅ Done! Public release updated on '$TARGET_BRANCH'."
if [[ "$PUSH" != true ]]; then
  echo ""
  echo "   To push:  git push $PUBLIC_REMOTE $TARGET_BRANCH:main"
  echo "   To review: git log $TARGET_BRANCH --oneline -5"
  echo "   To diff:   git diff $TARGET_BRANCH..$SOURCE_BRANCH --stat"
fi
