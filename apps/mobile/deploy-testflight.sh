#!/bin/bash
# =========================
# BUNKD: local -> GitHub -> TestFlight (EAS)
# Monorepo-aware deployment script
# =========================

set -euo pipefail

REPO_URL="https://github.com/bmbilon/bunkd.git"
BRANCH="main"
REPO_ROOT="/Users/brettbilon/bunkd"
MOBILE_APP_DIR="$REPO_ROOT/apps/mobile"

echo "== 0) Navigate to repo root and confirm location =="
cd "$REPO_ROOT"
pwd
echo ""

echo "== 1) Git: commit mobile app changes and push =="
# Ensure branch is main
git checkout -B "$BRANCH" 2>/dev/null || git checkout "$BRANCH"

# Set or replace origin to the intended repo
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

# Show what we're about to commit
echo "Changes to commit:"
git status --short

# Stage changes
git add apps/mobile/app/result.tsx
git add apps/mobile/app/\(tabs\)/history.tsx

# Commit only if there are changes staged
if git diff --cached --quiet; then
  echo "No changes to commit in mobile app."
else
  git commit -m "Mobile app: Add tabbed score breakdown, fix history tab, update claim ordering"
fi

# Pull with rebase to avoid merge commits
echo "Pulling latest changes from remote..."
git pull --rebase origin "$BRANCH" || {
  echo "Pull failed. You may need to resolve conflicts."
  exit 1
}

# Push to remote
echo "Pushing to GitHub..."
git push -u origin "$BRANCH"
echo ""

echo "== 2) Navigate to mobile app directory =="
cd "$MOBILE_APP_DIR"
pwd
echo ""

echo "== 3) Expo/EAS: login + verify configuration =="
# Install EAS CLI if missing
if ! command -v eas >/dev/null 2>&1; then
  echo "Installing EAS CLI..."
  npm i -g eas-cli
fi

# Check login status
echo "Checking EAS login status..."
if ! eas whoami 2>/dev/null; then
  echo "Please log in to EAS:"
  eas login
fi

echo "Logged in as: $(eas whoami)"
echo ""

# Verify project configuration
if [ ! -f app.json ] && [ ! -f app.config.ts ] && [ ! -f app.config.js ]; then
  echo "ERROR: No app.json / app.config.ts / app.config.js found."
  exit 1
fi

if [ ! -f eas.json ]; then
  echo "ERROR: eas.json not found. Run 'eas build:configure' first."
  exit 1
fi

echo "✓ EAS configuration found"
echo ""

echo "== 4) iOS Build for TestFlight (App Store / production profile) =="
echo "This will:"
echo "  - Build the app with the 'production' profile"
echo "  - Auto-increment build number"
echo "  - Create an archive suitable for App Store submission"
echo ""
echo "Starting build..."
eas build -p ios --profile production --non-interactive

echo ""
echo "== 5) Submit latest iOS build to TestFlight =="
echo "This will submit the most recent successful build to App Store Connect"
echo ""
eas submit -p ios --latest --non-interactive

echo ""
echo "✅ Done! Next steps:"
echo "   1. Go to App Store Connect (https://appstoreconnect.apple.com)"
echo "   2. Select your app"
echo "   3. Go to TestFlight tab"
echo "   4. Add internal/external testers"
echo "   5. Testers will receive an email with download link"
