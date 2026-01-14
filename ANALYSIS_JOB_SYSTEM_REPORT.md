# Bunkd Analysis Job System Architecture Report

**Date:** 2026-01-13
**Purpose:** Pre-conversion investigation before migrating polling worker to Supabase Edge Function

---

## Executive Summary

The Bunkd analysis job system currently uses:
- A **Node.js polling worker** (`services/perplexity-worker`) that runs locally and polls every 1.5 seconds
- An **existing Edge Function** (`run_job`) that can process jobs but has **schema conflicts** with current migrations
- A **pg_cron job** that triggers `run_job` every minute via HTTP

**Critical Finding:** There is a **schema mismatch** between the existing `run_job` Edge Function and the latest database migrations. The Edge Function expects tables (`analysis_results`, `analysis_sources`) and status values (`completed`) that no longer exist after the worker refactor migration.

**Recommendation:** Fix the schema conflicts first, then either:
1. Use the existing `run_job` Edge Function (triggered by pg_cron or webhooks)
2. Port the polling worker logic to an Edge Function if the existing one is outdated

---

## 1. Database Schema & Job Flow

### Current Schema (`analysis_jobs` table)

**Source:** `/Users/brettbilon/bunkd/supabase/migrations/20260111170000_analysis_jobs_worker.sql`

```sql
CREATE TABLE analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  input_type text NOT NULL CHECK (input_type IN ('url', 'text', 'image')),
  input_value text NOT NULL,
  normalized_input text NOT NULL,
  cache_key text NOT NULL,
  job_token uuid NOT NULL DEFAULT gen_random_uuid(),
  attempts int NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  claim_id uuid,
  last_error_code text,
  last_error_message text,
  perplexity_latency_ms int,
  bs_score numeric(3,1),
  result_json jsonb,
  model_used text,
  request_id text
);
```

### Status Values

**Valid statuses:** `'queued'`, `'running'`, `'done'`, `'failed'`

**Status Flow:**
```
queued → running → done
                 ↘ failed (if attempts >= MAX_ATTEMPTS or schema validation fails)
```

### Job Creation Triggers

**No automatic triggers exist.** Jobs are created explicitly by:
- **Edge Function:** `analyze_product` (inserts jobs with `status='queued'`)
- Mobile app calls this function when user submits a URL/text/image for analysis

### Indexes

```sql
- idx_analysis_jobs_cache_key (UNIQUE): Deduplication by content hash
- idx_analysis_jobs_status_claimed: Fast lookup for queued jobs
- idx_analysis_jobs_job_token: Token-based status polling
- idx_analysis_jobs_created_at: Time-ordered queries
```

---

## 2. Existing Edge Functions

### `analyze_product` (Job Submission)

**Purpose:** Enqueue new analysis jobs or return cached results

**Logic:**
1. Validates input (one of: `url`, `text`, `image_url`)
2. Normalizes input and generates SHA-256 `cache_key`
3. Checks for cached completed jobs with matching `cache_key`
4. **If cache hit:** Returns existing results immediately (`status: 'cached'`)
5. **If cache miss:** Inserts new job with `status='queued'` and returns `job_id` + `job_token`

**Caching Behavior:**
- Uses `cache_key` for deduplication
- Only returns cached results if job is `status='done'`
- If duplicate cache_key exists but job failed, resets it to `queued`

---

### `job_status` (Status Polling)

**Purpose:** Allow clients to check job progress using `job_id` + `job_token`

**Authentication:** Uses `job_token` for JWT-less access (no user auth required)

**Returns:**
- Current `status` (`queued`, `running`, `done`, `failed`)
- If `done`: `bs_score`, `result_json`
- If `failed`: `last_error_code`, `last_error_message`
- Metadata: `attempts`, `model_used`, `perplexity_latency_ms`

---

### `run_job` (Job Processor) ⚠️ **SCHEMA CONFLICT**

**Purpose:** Atomically claim and process next queued job

**Logic:**
1. Calls `acquire_next_job()` RPC (uses `FOR UPDATE SKIP LOCKED`)
2. Sets status to `'processing'` ⚠️ (no longer valid in new schema)
3. Fetches page content (if URL) or uses provided text/image
4. Retrieves active rubric from database
5. Calls Perplexity AI with system prompt
6. Parses JSON response
7. Inserts into `analysis_results` and `analysis_sources` ⚠️ (tables dropped in new schema)
8. Updates job to `'completed'` ⚠️ (should be `'done'`)

**Schema Conflicts:**
- Uses `acquire_next_job()` RPC which may not exist (replaced by `claim_next_job`)
- Expects status `'processing'` (new schema uses `'running'`)
- Expects status `'completed'` (new schema uses `'done'`)
- Writes to `analysis_results` and `analysis_sources` tables (dropped in worker refactor)
- Uses old job fields: `started_at`, `completed_at` (replaced by `claimed_at`, `updated_at`)

**Conclusion:** `run_job` is **outdated** and will fail against the current schema. It was built for the original schema before the worker refactor migration.

---

## 3. The `claim_next_job` RPC

**Source:** `/Users/brettbilon/bunkd/supabase/migrations/20260111170000_analysis_jobs_worker.sql` (lines 60-111)

```sql
CREATE OR REPLACE FUNCTION claim_next_job(p_max_attempts int DEFAULT 3)
RETURNS TABLE (
  id uuid,
  input_type text,
  input_value text,
  normalized_input text,
  cache_key text,
  attempts int,
  request_id text
)
```

### How It Works

**Safe Concurrent Claiming:**
```sql
SELECT id, input_type, input_value, normalized_input, cache_key, attempts, request_id
FROM analysis_jobs
WHERE (
  status = 'queued'
  AND attempts < p_max_attempts
)
OR (
  status = 'running'
  AND claimed_at < now() - interval '10 minutes'  -- Stale claim recovery
)
ORDER BY created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;  -- Critical: Prevents race conditions
```

**Atomicity:**
1. Locks a single row using `FOR UPDATE SKIP LOCKED`
2. Updates job atomically:
   - `status = 'running'`
   - `attempts = attempts + 1`
   - `claimed_at = now()`
   - `claim_id = gen_random_uuid()`
3. Returns job details to worker

### Stale Claim Recovery

If a worker crashes or times out, jobs with `claimed_at > 10 minutes` are automatically reclaimed.

### Concurrent Safety

**`FOR UPDATE SKIP LOCKED` ensures:**
- Multiple workers can call `claim_next_job()` concurrently
- Each worker gets a different job (no duplicates)
- No deadlocks or blocking

**This RPC is safe for:**
- Multiple Edge Function instances running simultaneously
- High-frequency polling
- Webhook-triggered invocations

---

## 4. Polling Worker Code Analysis

**File:** `/Users/brettbilon/bunkd/services/perplexity-worker/src/index.ts`

### Architecture

**Poll Loop:**
```typescript
while (true) {
  const job = await supabase.rpc('claim_next_job', { p_max_attempts: 3 });
  if (job) {
    await processJob(job);
    await sleep(500);
  } else {
    await sleep(1500);
  }
}
```

**Interval:** 1500ms (1.5 seconds) when no jobs, 500ms delay between jobs

### Job Processing Flow

1. **Claim job** via `claim_next_job` RPC
2. **Build Perplexity request** with strict text-based format (not JSON mode)
3. **Call Perplexity API** (`sonar-pro` model)
4. **Parse response** using custom text parser (`parseBunkdReport`)
5. **Validate schema** (checks for required headers: `BUNKD_V1`, `SUMMARY:`, `EVIDENCE_BULLETS:`, etc.)
6. **Retry once** if validation fails (sends strict replacement message)
7. **Compute final score** from subscores using weighted formula
8. **Update job** to `'done'` with `bs_score` and `result_json`

### Key Features

**Retry Logic:**
- Perplexity API: 2 retries with exponential backoff (1s, 2s delays)
- Schema validation: 1 retry with strict replacement message
- Job-level: Up to 3 attempts (configurable via `MAX_ATTEMPTS`)
- Failed validation after retry: Marks job as `'failed'` with `SCHEMA_VALIDATION_FAILED` error code

**Scoring:**
- Uses deterministic weighted formula: `0.4*HE + 0.25*AT + 0.25*MO + 0.10*PV`
- Rounds to nearest 0.5
- Validates all subscores use 0.5 increments

**Response Format:**
- Uses **text parsing** (NOT JSON mode)
- Expects structured text with headers: `BUNKD_V1`, `SUMMARY:`, `EVIDENCE_BULLETS:`, `SUBSCORES:`, etc.
- More robust than JSON mode (fewer parsing errors)

---

## 5. Mobile App Integration

**File:** `/Users/brettbilon/bunkd/apps/mobile/lib/api.ts`

### Job Submission

**Method:** `BunkdAPI.analyzeProduct({ url?, text?, image_url? })`

**Endpoint:** `POST /functions/v1/analyze_product`

**Authentication:**
- Ensures valid Supabase session (auto-creates anonymous session if needed)
- Includes JWT in `Authorization` header
- Has retry logic with session refresh on JWT expiration

**Response Handling:**
- If `status === 'cached'`: Navigate immediately to result screen
- If `status === 'queued'`: Start polling with `job_token`

### Job Status Polling

**Method:** `BunkdAPI.pollJobStatus(jobId, jobToken, onUpdate, maxAttempts, intervalMs)`

**Endpoint:** `GET /functions/v1/job_status?job_id={id}&job_token={token}`

**Polling Configuration:**
- **Interval:** 2000ms (2 seconds) - hardcoded default
- **Max attempts:** 30 (default)
- **Total timeout:** 60 seconds (30 × 2s)
- **Termination:** Stops when `status === 'done'` or `'failed'`

**UI Updates:**
```typescript
onUpdate callback fires on each poll:
- status: 'queued' → "Waiting in queue..."
- status: 'running' → "Processing analysis..."
- status: 'done' → Navigate to result screen
- status: 'failed' → Show error message
```

### Expected Endpoints

1. **`analyze_product`** (POST) - MUST exist
2. **`job_status`** (GET) - MUST exist

**Expected Response Fields:**
```typescript
{
  status: 'queued' | 'running' | 'done' | 'failed';
  job_id: string;
  job_token: string;
  bs_score?: number;
  result_json?: {
    bunk_score: number;  // Can be bs_score, bunk_score, or bunkd_score
    summary: string;
    subscores?: { ... };
    evidence_bullets?: string[];
    red_flags?: string[];
    key_claims?: Array<{ claim, support_level, why }>;
    citations?: Array<{ url, title, snippet }>;
  };
  updated_at?: string;
  last_error_code?: string;
  last_error_message?: string;
}
```

### Job Token Authentication

**Purpose:** Allow JWT-less status polling

**Flow:**
1. `analyze_product` returns `job_id` + `job_token` (UUID)
2. Client stores `job_token` temporarily
3. Each `job_status` poll includes both as query params
4. Edge Function validates token matches job before returning status

**Security:** Prevents unauthorized users from checking arbitrary job statuses

---

## 6. Consequences of Switching Architectures

### Option A: Webhook-Triggered Edge Function (INSERT trigger)

**How it works:**
```sql
CREATE TRIGGER on_job_insert
AFTER INSERT ON analysis_jobs
FOR EACH ROW
EXECUTE FUNCTION pg_net.http_post(
  'https://...supabase.co/functions/v1/run_job',
  headers := '{"Authorization": "Bearer <service_role>"}'
);
```

**Pros:**
- Lowest latency (job processed immediately on insert)
- No polling overhead
- Scales automatically with Edge Function concurrency

**Cons:**
- **Burst handling concern:** If many jobs are submitted simultaneously, each triggers a separate Edge Function invocation
  - Supabase Edge Functions have concurrency limits per project
  - Risk of rate limiting or cold starts
- **Stale claim recovery broken:** Webhook only fires on INSERT, not on stale job reclaim
  - Need separate pg_cron job to reclaim stale jobs
- **No retry on failure:** If Edge Function times out or crashes, job stays `'running'` forever (unless reclaim logic catches it)

**Verdict:** ⚠️ Not recommended without additional safeguards

---

### Option B: pg_cron with Polling (Current System)

**How it works:**
```sql
SELECT cron.schedule(
  'process-analysis-jobs',
  '* * * * *',  -- Every minute
  $$SELECT trigger_job_processing()$$
);
```

Where `trigger_job_processing()` makes an HTTP call to Edge Function.

**Existing Implementation:**
- Already configured in `/Users/brettbilon/bunkd/supabase/migrations/20260111131252_automate_job_processing.sql`
- Calls `https://qmhqfmkbvyeabftpchex.supabase.co/functions/v1/run_job` every minute

**Pros:**
- Controlled concurrency (1 invocation per minute)
- Handles stale claims naturally (pg_cron keeps triggering)
- Built-in retry (Edge Function can process multiple jobs per invocation)

**Cons:**
- **Latency:** Jobs wait up to 60 seconds before processing starts
  - With polling worker: 1.5s average latency
  - With pg_cron (1 min): 30s average latency (**20x slower**)
- **Mobile app timeout:** Client polls for 60 seconds total
  - If job queues at 0s, processes at 30s, completes at 40s: Client times out
  - **Solution:** Increase mobile app polling timeout OR reduce pg_cron interval

**Verdict:** ⚠️ Acceptable IF latency increase is acceptable AND mobile app timeout is adjusted

---

### Option C: High-Frequency pg_cron (Every 10-30 seconds)

**How it works:**
```sql
SELECT cron.schedule(
  'process-analysis-jobs',
  '*/30 * * * * *',  -- Every 30 seconds (if supported)
  $$SELECT trigger_job_processing()$$
);
```

**Note:** Standard pg_cron uses minute-level granularity. Sub-minute scheduling may require:
- Custom extension or wrapper
- Multiple staggered cron jobs (0s, 10s, 20s, 30s, 40s, 50s)

**Pros:**
- Lower latency than 1-minute interval (15s average for 30s interval)
- Still controlled concurrency

**Cons:**
- **Still slower than polling worker** (1.5s avg)
- **Complex to configure** if pg_cron doesn't support sub-minute

**Verdict:** ⚠️ Better than 1-minute, but harder to configure

---

### Option D: Port Worker to Always-Running Edge Function

**How it works:**
- Deploy polling worker code to Supabase Edge Function
- **Problem:** Edge Functions are **request-based**, not long-running processes
- They time out after ~60 seconds per invocation

**Conclusion:** ❌ Not feasible. Edge Functions are not designed for infinite polling loops.

---

### Option E: Port Worker to Fly.io / Railway / Render

**How it works:**
- Deploy `services/perplexity-worker` as a containerized app on a platform that supports long-running processes
- Keeps the 1.5s polling interval and low latency

**Pros:**
- Maintains current low-latency architecture
- Simple migration (just deploy existing code)
- Full control over polling frequency

**Cons:**
- Requires external hosting (costs ~$5-10/month)
- Another service to manage

**Verdict:** ✅ Recommended if latency is critical

---

### Option F: Fix `run_job` Edge Function + Use pg_cron

**How it works:**
1. Update `run_job` Edge Function to match new schema:
   - Use `claim_next_job` RPC instead of `acquire_next_job`
   - Change status values: `'running'` and `'done'` instead of `'processing'` and `'completed'`
   - Remove writes to `analysis_results` and `analysis_sources` tables
   - Store results directly in `analysis_jobs.result_json`
2. Keep existing pg_cron job that triggers `run_job` every minute

**Pros:**
- Uses existing infrastructure (no new hosting needed)
- Edge Function can process multiple jobs per invocation (loop through queue)
- Proper concurrency safety via `claim_next_job` RPC

**Cons:**
- Still has latency issue (up to 60s delay)
- Requires updating Edge Function code

**Verdict:** ✅ Good compromise IF latency is acceptable

---

## 7. Race Conditions & Retry Logic

### Concurrent Workers

**`claim_next_job` RPC is designed for concurrent execution:**
- `FOR UPDATE SKIP LOCKED` ensures no two workers get the same job
- Each invocation atomically increments `attempts` counter
- Safe for:
  - Multiple Edge Function instances
  - Parallel webhook triggers
  - Mixed polling + cron invocations

**No race conditions possible.**

### Retry Logic Compatibility

**Current retry mechanism:**
1. Job starts with `attempts = 0`
2. Worker claims job, increments to `attempts = 1`
3. If processing fails, worker sets `status = 'queued'` (unless `attempts >= MAX_ATTEMPTS`)
4. Next worker picks it up again

**This works with:**
- ✅ Polling worker (tested)
- ✅ pg_cron (each invocation can claim and retry)
- ✅ Webhooks (each INSERT of a new job triggers processing)

**Potential issue with webhooks:**
- Webhook only fires on INSERT, not on UPDATE back to `'queued'`
- **Solution:** Webhook should only be used for initial job creation
- Failed jobs that are reset to `'queued'` must be picked up by pg_cron or polling

---

## 8. Breaking Changes Summary

### Schema Migration Already Broke `run_job`

The latest migration (`20260111170000_analysis_jobs_worker.sql`) made breaking changes:
- ❌ Dropped `analysis_results` table
- ❌ Dropped `analysis_sources` table
- ❌ Dropped `product_inputs` table
- ❌ Changed status values: `'processing'` → `'running'`, `'completed'` → `'done'`
- ❌ Removed columns: `started_at`, `completed_at`, `user_id`, `fingerprint`
- ❌ Renamed RPC: `acquire_next_job` → `claim_next_job` (possibly)

**Current state:** `run_job` Edge Function is non-functional against latest schema.

### If Converting to Edge Function-Based System

**Required changes:**
1. **Update `run_job` code** to match new schema
2. **OR** Replace `run_job` with polling worker logic ported to Edge Function
3. **Update mobile app polling timeout** if using pg_cron (increase from 60s to 120s+)
4. **Test burst handling** if using webhooks

**No breaking changes to mobile app if:**
- `analyze_product` and `job_status` endpoints remain unchanged
- Response format stays compatible
- Status values stay the same (`'queued'`, `'running'`, `'done'`, `'failed'`)

---

## 9. Recommendations

### Immediate Action Required

**Fix the schema conflict:**
1. Update `run_job` Edge Function to use new schema
2. OR deprecate `run_job` and use a new Edge Function based on polling worker code

### Recommended Architecture

**Option 1: External Hosting (Best Latency)**
- Deploy `services/perplexity-worker` to Fly.io/Railway/Render
- Keep 1.5s polling interval
- ~$5-10/month cost
- No changes to mobile app

**Option 2: Hybrid pg_cron + Edge Function (Acceptable Latency)**
- Fix `run_job` Edge Function schema issues
- Use pg_cron every 1 minute (or increase to every 30s if possible)
- Increase mobile app polling timeout to 120 seconds
- Edge Function processes all available jobs per invocation (loop)
- Zero additional cost

**Option 3: Keep Polling Worker Locally (Dev/Staging Only)**
- Run `services/perplexity-worker` on local machine or dev server
- Not suitable for production (no reliability)

### Do NOT Use

- ❌ INSERT webhooks without pg_cron backup (stale claim recovery missing)
- ❌ Current `run_job` without schema fixes (will fail)
- ❌ Always-running Edge Function (not supported)

---

## 10. Migration Path

### If Choosing Option 1 (External Hosting)

1. Containerize `services/perplexity-worker` (already has Dockerfile if you need one)
2. Deploy to Fly.io/Railway/Render with env vars
3. Monitor logs and health checks
4. Deprecate local polling worker

**No code changes needed.**

### If Choosing Option 2 (pg_cron + Fixed Edge Function)

1. **Create new Edge Function:** `claim_and_process_jobs`
   - Based on `services/perplexity-worker/src/index.ts` logic
   - Use `claim_next_job` RPC
   - Process jobs in a loop until no more available
   - Return job count processed
2. **Update pg_cron:**
   - Change target from `run_job` to `claim_and_process_jobs`
   - Consider reducing interval to 30 seconds if possible
3. **Update mobile app:**
   - Increase polling timeout from 60s to 120s
   - OR reduce pg_cron interval to 30s (keeps 60s timeout viable)
4. **Deprecate `run_job`:**
   - Mark as deprecated or delete
5. **Test:**
   - Submit multiple jobs simultaneously (burst test)
   - Verify retry logic works
   - Confirm stale claim recovery works

**Code changes required:**
- New Edge Function (port existing worker logic)
- Mobile app timeout adjustment (1 line change)

---

## Appendix: File References

### Migrations
- `supabase/migrations/20260111121320_init_bunkd.sql` - Original schema
- `supabase/migrations/20260111131252_automate_job_processing.sql` - pg_cron setup
- `supabase/migrations/20260111170000_analysis_jobs_worker.sql` - Worker refactor (current)

### Edge Functions
- `supabase/functions/analyze_product/index.ts` - Job submission
- `supabase/functions/job_status/index.ts` - Status polling
- `supabase/functions/run_job/index.ts` - Job processor (BROKEN)

### Worker
- `services/perplexity-worker/src/index.ts` - Polling worker (current production)

### Mobile App
- `apps/mobile/lib/api.ts` - API client (job submission & polling)
- `apps/mobile/app/(tabs)/index.tsx` - UI that calls API

---

**End of Report**
