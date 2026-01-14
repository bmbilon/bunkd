#!/bin/bash
#
# Quick deployment script for perplexity-worker
#
# Usage: ./deploy.sh [--skip-test]
#

set -e  # Exit on error

echo "🚀 Perplexity Worker Deployment Script"
echo ""

# Check if we're in the right directory
if [ ! -f "fly.toml" ]; then
  echo "❌ Error: Must be run from services/perplexity-worker directory"
  exit 1
fi

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
  echo "❌ Error: flyctl not installed"
  echo "Install with: brew install flyctl"
  exit 1
fi

# Skip tests if --skip-test flag is passed
SKIP_TEST=false
if [ "$1" == "--skip-test" ]; then
  SKIP_TEST=true
fi

# Step 1: TypeScript compilation check
echo "📦 Step 1: Checking TypeScript compilation..."
if npm run build; then
  echo "✅ TypeScript compiled successfully"
else
  echo "❌ TypeScript compilation failed"
  exit 1
fi
echo ""

# Step 2: Run fetch test (optional)
if [ "$SKIP_TEST" == "false" ]; then
  echo "🧪 Step 2: Running fetch test (optional)..."
  echo "To test with a specific URL, run:"
  echo "  npm run test:fetch https://your-product-url.com"
  echo ""
  read -p "Skip fetch test? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter product URL to test: " TEST_URL
    if [ ! -z "$TEST_URL" ]; then
      npm run test:fetch "$TEST_URL" || {
        echo "⚠️  Fetch test failed, but continuing..."
      }
    fi
  fi
  echo ""
else
  echo "⏭️  Skipping fetch test (--skip-test flag)"
  echo ""
fi

# Step 3: Confirm deployment
echo "🎯 Step 3: Ready to deploy to Fly.io"
echo ""
echo "Current app status:"
flyctl status || echo "⚠️  Could not fetch status"
echo ""
read -p "Deploy to production? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Deployment cancelled"
  exit 0
fi

# Step 4: Deploy
echo ""
echo "🚀 Step 4: Deploying to Fly.io..."
if flyctl deploy; then
  echo ""
  echo "✅ Deployment successful!"
else
  echo ""
  echo "❌ Deployment failed"
  exit 1
fi

# Step 5: Monitor logs
echo ""
echo "📊 Step 5: Monitoring deployment..."
echo "Showing logs for 30 seconds. Press Ctrl+C to exit."
echo ""
timeout 30 flyctl logs -f || true

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Monitor logs: flyctl logs -f"
echo "  2. Check status: flyctl status"
echo "  3. Test with mobile app"
echo ""
echo "Useful commands:"
echo "  flyctl logs              - View recent logs"
echo "  flyctl logs -f           - Stream logs"
echo "  flyctl status            - Check service status"
echo "  flyctl ssh console       - SSH into container"
echo "  flyctl releases rollback - Rollback if needed"
echo ""
