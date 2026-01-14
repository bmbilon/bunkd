# Perplexity Worker

Worker service that polls Supabase for queued analysis jobs, calls Perplexity API, computes Bunkd Scores, and writes results back to Supabase.

## Architecture

- **analyze_product** Edge Function: Ingress only - enqueues jobs, returns job_id + job_token
- **job_status** Edge Function: Reads job status using job_id + job_token (no JWT)
- **perplexity-worker**: This service - processes jobs asynchronously

## Required Environment Variables

**No file editing required!** The worker automatically loads env from multiple locations:

1. **Exported environment variables** (highest priority)
2. `services/perplexity-worker/.env`
3. Repo root `.env` (`~/bunkd/.env`)
4. `supabase/.env`

Required variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Get from: Dashboard → Settings → API → service_role
- `PERPLEXITY_API_KEY` - Get from: https://www.perplexity.ai/settings/api

Optional:
- `PERPLEXITY_MODEL` (default: `llama-3.1-sonar-large-128k-online`)
- `POLL_INTERVAL_MS` (default: `1500`)
- `MAX_ATTEMPTS` (default: `3`)

## Quick Start (Recommended)

### Option 1: Export environment variables (preferred for local dev)

```bash
# Export keys before running
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..."
export PERPLEXITY_API_KEY="pplx-..."

cd services/perplexity-worker
npm install
./bin/dev.sh
```

### Option 2: Add to repo root .env

```bash
# Create or edit ~/bunkd/.env
echo "SUPABASE_SERVICE_ROLE_KEY=eyJhbGc..." >> ~/.../bunkd/.env
echo "PERPLEXITY_API_KEY=pplx-..." >> ~/.../bunkd/.env

cd services/perplexity-worker
npm install
./bin/dev.sh
```

## Installation

```bash
cd services/perplexity-worker
npm install
```

## Running Locally

### Development (with hot reload) - Recommended
```bash
./bin/dev.sh
```

Or manually:
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

## How It Works

1. **Poll**: Worker polls `claim_next_job()` RPC function every 1.5s
2. **Claim**: Atomically claims a queued job (sets status=running, increments attempts)
3. **Execute**: Calls Perplexity API with timeout and retries
4. **Score**: Parses response, computes Bunkd Score (0-10)
5. **Write**: Updates job with status=done, bs_score, result_json
6. **Retry**: On failure, requeues (status=queued) if attempts < MAX_ATTEMPTS

## Startup Validation

The worker validates environment variables on startup:
- ✅ Logs safe prefixes (first 6 chars of service key, first 4 of API key)
- ❌ Fails fast with helpful errors if keys are missing or placeholders
- 📁 Shows which .env files were loaded

Example success output:
```
✅ Environment loaded:
  SUPABASE_URL: https://qmhqfmkbvyeabftpchex.supabase.co
  SUPABASE_SERVICE_ROLE_KEY: eyJhbG...
  PERPLEXITY_API_KEY: pplx...
  PERPLEXITY_MODEL: llama-3.1-sonar-large-128k-online

🚀 Perplexity Worker started
```

## Logs

Worker outputs:
- Job ID (first 8 chars)
- Input type and length
- Perplexity latency
- Bunkd Score
- Status transitions
- Errors (no secrets)

## Testing

Before deploying, test that the worker can fetch and parse product pages:

```bash
# Test fetching a product URL
npm run test:fetch https://example.com/product-page
```

This will:
- Fetch the page content
- Show content statistics (length, lines)
- Display a preview of extracted text
- Check for common product elements (ingredients, price, volume)
- Save full output to `test-fetch-output.txt`

## Deployment

The worker is deployed on **Fly.io**. See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

### Quick Deploy

```bash
# Interactive deployment with tests
./deploy.sh

# Skip tests and deploy immediately
./deploy.sh --skip-test

# Or deploy manually
flyctl deploy
```

### Monitor Deployment

```bash
# View logs
flyctl logs -f

# Check status
flyctl status

# Rollback if needed
flyctl releases rollback
```

For detailed deployment instructions, troubleshooting, and monitoring, see [DEPLOYMENT.md](./DEPLOYMENT.md).
