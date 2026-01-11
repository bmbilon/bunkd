#!/usr/bin/env bash

# Development helper script for perplexity-worker
# Loads env from multiple locations and runs the worker

set -e

# Get script directory and worker root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$WORKER_ROOT/../.." && pwd)"

echo "🔧 Perplexity Worker - Development Mode"
echo ""

# Change to worker directory
cd "$WORKER_ROOT"

# Load env files if they exist (in order of priority)
# Note: The worker itself also loads these, but we load them here
# so exported vars are available to npm scripts
ENV_FILES=(
  "$WORKER_ROOT/.env"
  "$REPO_ROOT/.env"
  "$REPO_ROOT/supabase/.env"
)

for env_file in "${ENV_FILES[@]}"; do
  if [ -f "$env_file" ]; then
    echo "📁 Loading env from: $env_file"
    # Export vars from .env file (skip comments and empty lines)
    set -a
    source <(grep -v '^#' "$env_file" | grep -v '^[[:space:]]*$' | sed 's/^/export /')
    set +a
  fi
done

echo ""
echo "🚀 Starting worker with npm run dev..."
echo "   (Press Ctrl+C to stop)"
echo ""

# Run the worker
npm run dev
