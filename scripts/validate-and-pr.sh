#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "  Share Drobe: Pre-PR Validation & Creation Pipeline"
echo "=================================================="

# 1. Branch Safety Check
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  echo "❌ Error: Cannot run validate-and-pr directly on '$CURRENT_BRANCH'." >&2
  echo "   Please create or switch to a feature branch first." >&2
  exit 1
fi

echo "📌 Current branch: $CURRENT_BRANCH"

# 2. Linting
echo ""
echo "🔍 [1/3] Running ESLint..."
npm run lint

# 3. TypeScript Typecheck
echo ""
echo "🧩 [2/3] Checking TypeScript types..."
npm run typecheck

# 4. Production Next.js Build
echo ""
echo "📦 [3/3] Building Next.js application..."
npm run build

# 5. Push Branch to Remote
echo ""
echo "🚀 Pushing branch '$CURRENT_BRANCH' to origin..."
PUSHED=0
if GIT_TERMINAL_PROMPT=0 git push -u origin "$CURRENT_BRANCH"; then
  PUSHED=1
  echo "✅ Branch pushed successfully."
else
  echo "⚠️ Note: Git remote credentials required. Please run:"
  echo "   git push -u origin $CURRENT_BRANCH"
fi

# 6. Open or Link Pull Request
echo ""
COMPARE_URL="https://github.com/sheen93/sharedrobe/compare/main...${CURRENT_BRANCH}?expand=1"

if [ "$PUSHED" -eq 1 ] && command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "🤖 GitHub CLI detected and authenticated."
  echo "Opening Pull Request against main..."
  gh pr create --base main --head "$CURRENT_BRANCH" --fill || {
    echo "ℹ️ Note: If a PR already exists, you can view it with 'gh pr view --web'."
  }
else
  echo "=================================================="
  echo "🎉 Validation passed (lint, typecheck, and build)!"
  echo ""
  echo "🔗 Open your Pull Request on GitHub by visiting:"
  echo "   $COMPARE_URL"
  echo ""
  echo "💡 Tip: To enable automatic PR creation from the CLI in the future:"
  echo "   Install and authenticate 'gh' (https://cli.github.com):"
  echo "   - Linux: sudo apt install gh && gh auth login"
  echo "   - macOS: brew install gh && gh auth login"
  echo "=================================================="
fi
