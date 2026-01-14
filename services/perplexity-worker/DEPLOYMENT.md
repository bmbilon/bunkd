# Perplexity Worker - Deployment Guide

## Overview

The perplexity-worker is deployed on **Fly.io** as a background worker service. This guide covers testing locally and deploying to production.

---

## ✅ Pre-Deployment Testing

### Step 1: Test Page Fetching Locally

Before deploying, verify that the worker can fetch and parse product pages correctly:

```bash
cd /Users/brettbilon/bunkd/services/perplexity-worker

# Test with a sample product URL
npm run test:fetch https://example.com/product-page

# Test with your actual lash serum URL
npm run test:fetch https://your-actual-product-url.com
```

**What to check:**
- ✅ Fetch completes successfully
- ✅ Content length is substantial (>1000 characters)
- ✅ Content analysis shows it found ingredients, price, volume
- ✅ Output file `test-fetch-output.txt` contains the expected product details

**Common issues:**
- ❌ **"403 Forbidden"**: Site blocks bots - may need to adjust User-Agent or use a proxy
- ❌ **"Empty content"**: Site uses JavaScript rendering - worker cannot execute JS (consider Puppeteer upgrade)
- ❌ **"Timeout"**: Site is slow - increase timeout in fetchPageText function

### Step 2: Test Worker Locally (Optional)

To test the full worker with real job processing:

```bash
cd /Users/brettbilon/bunkd/services/perplexity-worker

# Ensure environment variables are set
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export PERPLEXITY_API_KEY="your-perplexity-api-key"

# Run worker locally
npm run dev
```

**Expected output:**
```
✅ Environment loaded:
  SUPABASE_URL: https://qmhqfmkbvyeabftpchex.supabase.co
  SUPABASE_SERVICE_ROLE_KEY: eyJhbG...
  PERPLEXITY_API_KEY: pplx...

🚀 Perplexity Worker started
   Model: sonar-pro (strict JSON mode)
   Poll interval: 1500ms
   Max attempts: 3
```

The worker will poll for jobs every 1.5 seconds. Submit a test job via the mobile app to see it process.

### Step 3: Verify TypeScript Compilation

Ensure your changes compile without errors:

```bash
cd /Users/brettbilon/bunkd/services/perplexity-worker
npm run build
```

**Expected output:**
```
Successfully compiled TypeScript files to dist/
```

If there are errors, fix them before deploying.

---

## 🚀 Deployment to Fly.io

### Prerequisites

1. **Install Fly CLI** (if not already installed):
   ```bash
   brew install flyctl
   ```

2. **Authenticate with Fly.io**:
   ```bash
   flyctl auth login
   ```

3. **Check current app status**:
   ```bash
   cd /Users/brettbilon/bunkd/services/perplexity-worker
   flyctl status
   ```

### Deployment Steps

#### 1. Build and Deploy

```bash
cd /Users/brettbilon/bunkd/services/perplexity-worker

# Deploy to Fly.io (builds Docker image and deploys)
flyctl deploy
```

**What happens:**
1. Fly.io builds a Docker image using the `Dockerfile`
2. Runs `npm run build` to compile TypeScript
3. Creates a new release
4. Rolls out to the `sjc` (San Jose) region
5. Health checks pass and service starts

**Expected output:**
```
==> Building image
...
==> Pushing image to fly
...
==> Monitoring deployment
 1 desired, 1 placed, 1 healthy, 0 unhealthy
--> v2 deployed successfully
```

#### 2. Verify Deployment

Check that the worker is running and processing jobs:

```bash
# View recent logs
flyctl logs

# Monitor logs in real-time
flyctl logs -f
```

**What to look for in logs:**
```
✅ Environment loaded:
  SUPABASE_URL: https://...
  SUPABASE_SERVICE_ROLE_KEY: eyJhbG...
  PERPLEXITY_API_KEY: pplx...

🚀 Perplexity Worker started

[a1b2c3d4] Processing job (attempt 1)
  Input type: url
  Input length: 45
  Fetching page content from: https://example.com/product
  ✓ Fetched 23456 characters of content
  Calling Perplexity (model: sonar-pro)...
  ✓ Perplexity responded in 1234ms
  ✓ Subscores received: HE=7.5, AT=6.0, MO=8.5, PV=5.0
  ✓ Computed Bunk Score: 7.0 | Verdict: elevated
  ✓ Job completed successfully
```

#### 3. Check Service Health

```bash
# View service status
flyctl status

# View resource usage
flyctl vm status
```

### Environment Variables

Environment variables are stored as Fly.io secrets. To update them:

```bash
# Set/update secrets
flyctl secrets set PERPLEXITY_API_KEY=pplx-new-key
flyctl secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# List secrets (values are hidden)
flyctl secrets list

# Remove a secret
flyctl secrets unset SECRET_NAME
```

**Note:** Setting secrets triggers a redeployment.

---

## 🔍 Monitoring & Debugging

### View Logs

```bash
# Last 100 log lines
flyctl logs

# Stream logs in real-time
flyctl logs -f

# Filter logs by app instance
flyctl logs --instance 9080528f610e87
```

### Check Job Processing

Monitor your Supabase database to verify jobs are being processed:

```sql
-- Check recent jobs
SELECT id, status, input_type, bs_score, created_at, completed_at
FROM analysis_jobs
ORDER BY created_at DESC
LIMIT 10;

-- Check for stuck jobs (running > 5 minutes)
SELECT id, status, attempts, created_at
FROM analysis_jobs
WHERE status = 'running'
  AND updated_at < NOW() - INTERVAL '5 minutes';

-- Check failure rate
SELECT status, COUNT(*)
FROM analysis_jobs
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY status;
```

### Scale Resources

If the worker is slow or timing out:

```bash
# Scale to 2 workers
flyctl scale count 2

# Increase memory (currently 1GB)
flyctl scale memory 2048

# View current scaling
flyctl scale show
```

### SSH into Worker

For advanced debugging:

```bash
# SSH into the running container
flyctl ssh console

# Inside container:
cd /app
node dist/index.js  # Run manually
```

---

## 🔄 Rollback

If the deployment breaks something:

```bash
# List recent releases
flyctl releases

# Rollback to previous version
flyctl releases rollback --version <version-number>
```

---

## 📊 Performance Tuning

### If Jobs Are Processing Slowly

1. **Check Perplexity API latency** in logs (should be <3 seconds)
2. **Increase max_tokens** if analyses are truncated (currently 2500)
3. **Scale worker count** if queue is backing up
4. **Increase memory** if worker is OOM-killing

### If Page Fetching Fails

1. **Check if site blocks User-Agent** - update User-Agent string
2. **Add retry logic** in fetchPageText for transient failures
3. **Increase timeout** for slow sites (currently 30s)
4. **Consider Puppeteer** for JavaScript-heavy sites

---

## 🚨 Emergency Procedures

### Stop the Worker

```bash
# Scale to 0 instances (stops processing)
flyctl scale count 0
```

### Restart the Worker

```bash
# Restart all instances
flyctl restart

# Or restart specific instance
flyctl restart --instance <instance-id>
```

### Check for Breaking Changes

If Perplexity API changes:
1. Check their changelog: https://docs.perplexity.ai/changelog
2. Update model name in `.env` if needed
3. Test with `npm run dev` locally first
4. Redeploy with `flyctl deploy`

---

## 📝 Post-Deployment Checklist

After deploying:

- [ ] Check `flyctl logs` for startup success
- [ ] Submit a test analysis via mobile app
- [ ] Verify job completes in Supabase database
- [ ] Check that fetched page content appears in logs
- [ ] Verify Bunkd Score is accurate for test product
- [ ] Monitor for 10-15 minutes for errors

---

## 🔗 Useful Links

- **Fly.io Dashboard**: https://fly.io/dashboard
- **Perplexity API Docs**: https://docs.perplexity.ai/
- **Supabase Dashboard**: https://supabase.com/dashboard/project/qmhqfmkbvyeabftpchex
- **Worker App Page**: https://fly.io/apps/perplexity-worker

---

## 💡 Tips

1. **Always test locally first** with `npm run test:fetch` and `npm run dev`
2. **Watch logs during deployment** with `flyctl logs -f`
3. **Keep environment variables updated** in Fly.io secrets
4. **Monitor job completion rates** in Supabase
5. **Set up alerts** for failed jobs or high error rates

---

For questions or issues, check the main README.md or contact the team.
