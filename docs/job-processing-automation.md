# Job Processing Automation

## Overview

Bunkd uses a job queue system for analysis. Jobs need to be processed regularly to feel "alive" and responsive.

**Goal**: Process jobs automatically every 30-60 seconds.

## Quick Start (Recommended)

### Option 1: GitHub Actions (Easiest, Free)

1. Add secrets to your GitHub repository:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Service role key (from Supabase dashboard)

2. The workflow is already set up in `.github/workflows/process-jobs.yml`

3. It runs every 5 minutes automatically

**Limitations**: GitHub Actions minimum interval is 5 minutes (not 60 seconds)

### Option 2: Vercel Cron (60-second intervals)

Create `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/process-jobs",
    "schedule": "* * * * *"
  }]
}
```

Create `api/cron/process-jobs.js`:
```javascript
export default async function handler(req, res) {
  const response = await fetch(
    'https://YOUR_PROJECT.supabase.co/functions/v1/run_job',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    }
  );

  const data = await response.json();
  res.status(200).json(data);
}
```

### Option 3: EasyCron / Cron-Job.org (External Services)

1. Sign up for a cron service
2. Create a job that hits: `YOUR_PROJECT.supabase.co/functions/v1/run_job`
3. Add header: `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`
4. Method: POST
5. Body: `{}`
6. Schedule: Every minute

### Option 4: Railway / Render (Long-running Process)

Deploy a simple Node.js app that runs every 60 seconds:

```javascript
// server.js
setInterval(async () => {
  await fetch('https://YOUR_PROJECT.supabase.co/functions/v1/run_job', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
}, 60000); // Every 60 seconds

// Keep process alive
require('http').createServer((req, res) => {
  res.writeHead(200);
  res.end('Job processor running');
}).listen(process.env.PORT || 3000);
```

### Option 5: Local Development

Run locally while developing:

```bash
# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run in a loop
while true; do
  node scripts/process-jobs.js
  sleep 60
done
```

Or use `watch`:
```bash
watch -n 60 "node scripts/process-jobs.js"
```

## Database Cron (pg_cron)

A migration has been created (`20260111131252_automate_job_processing.sql`) to set up pg_cron, but it requires:
- pg_cron extension enabled
- pg_net extension for HTTP requests
- Proper permissions

**Status**: May not work on all Supabase plans. Use external cron as fallback.

## Testing

Test the automation:

1. Create a test job:
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/analyze_product' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -d '{"text": "Test product"}'
```

2. Wait 60 seconds (or your cron interval)

3. Check job status:
```bash
curl 'https://YOUR_PROJECT.supabase.co/functions/v1/job_status?job_id=JOB_ID' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

Should show `status: "completed"` or `status: "processing"`

## Monitoring

Check if jobs are being processed:

```sql
SELECT
  status,
  COUNT(*) as count,
  MAX(created_at) as latest_job,
  MAX(completed_at) as latest_completion
FROM analysis_jobs
GROUP BY status;
```

Healthy system indicators:
- Most jobs in "completed" state
- Few jobs stuck in "processing" (< 1 minute old)
- No jobs stuck in "queued" for > 2 minutes

## Troubleshooting

### Jobs stay "queued"
- Check cron service is running
- Verify service role key is correct
- Check edge function logs in Supabase dashboard

### Jobs fail repeatedly
- Check PPLX_API_KEY is set correctly
- Check Perplexity API quota
- Review error messages in `analysis_jobs.error_message`

### Cron not triggering
- Verify secrets are set in deployment platform
- Check cron service status/logs
- Test manual trigger: `node scripts/process-jobs.js`

## Production Recommendations

1. **Use a paid cron service** for reliability (EasyCron, Cronitor)
2. **Set up monitoring** (Sentry, LogRocket) for failed jobs
3. **Add alerting** when jobs are queued for > 5 minutes
4. **Scale**: If processing > 100 jobs/hour, consider:
   - Multiple cron triggers
   - Batch processing (process N jobs per call)
   - Dedicated worker service

## Security

- **Never expose service role key** in client code
- Store in environment variables only
- Rotate keys if compromised
- Monitor for unusual job patterns

## Performance Tuning

- **Every 60 seconds**: Good for most use cases
- **Every 30 seconds**: High-responsiveness mode
- **Every 5 minutes**: Low-volume use cases

Current implementation processes **1 job per trigger**. For higher volume:
- Modify `run_job` to process multiple jobs
- Or trigger more frequently
- Or run multiple cron jobs in parallel
