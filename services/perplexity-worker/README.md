# Perplexity Worker

Worker service that polls Supabase for queued analysis jobs, calls Perplexity API, computes Bunkd Scores, and writes results back to Supabase.

## Architecture

- **analyze_product** Edge Function: Ingress only - enqueues jobs, returns job_id + job_token
- **job_status** Edge Function: Reads job status using job_id + job_token (no JWT)
- **perplexity-worker**: This service - processes jobs asynchronously

## Required Environment Variables

Create a `.env` file with:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Perplexity API
PERPLEXITY_API_KEY=your-perplexity-api-key
PERPLEXITY_MODEL=llama-3.1-sonar-large-128k-online

# Worker Configuration (optional)
POLL_INTERVAL_MS=1500
MAX_ATTEMPTS=3
```

## Installation

```bash
cd services/perplexity-worker
npm install
```

## Running Locally

### Development (with hot reload)
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

## Logs

Worker outputs:
- Job ID (first 8 chars)
- Input type and length
- Perplexity latency
- Bunkd Score
- Status transitions
- Errors (no secrets)

## Deployment

For production, run as a systemd service, Docker container, or on a platform like Railway/Render.

Example systemd service:

```ini
[Unit]
Description=Perplexity Worker
After=network.target

[Service]
Type=simple
User=worker
WorkingDirectory=/opt/bunkd/services/perplexity-worker
EnvironmentFile=/opt/bunkd/services/perplexity-worker/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```
