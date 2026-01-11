-- Migration: Analysis Jobs Worker Architecture
-- Purpose: Refactor to use job_token polling without JWT requirement

-- Drop existing tables if they exist (clean slate approach)
DROP TABLE IF EXISTS analysis_sources CASCADE;
DROP TABLE IF EXISTS analysis_results CASCADE;
DROP TABLE IF EXISTS analysis_jobs CASCADE;
DROP TABLE IF EXISTS product_inputs CASCADE;

-- Create analysis_jobs table for worker-based architecture
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

-- Indexes for performance
CREATE UNIQUE INDEX idx_analysis_jobs_cache_key ON analysis_jobs(cache_key);
CREATE INDEX idx_analysis_jobs_status_claimed ON analysis_jobs(status, claimed_at) WHERE status = 'queued';
CREATE INDEX idx_analysis_jobs_job_token ON analysis_jobs(job_token);
CREATE INDEX idx_analysis_jobs_created_at ON analysis_jobs(created_at DESC);

-- Enable RLS (all access via Edge Functions with service role)
ALTER TABLE analysis_jobs ENABLE ROW LEVEL SECURITY;

-- No client policies needed - all access via Edge Functions

-- Trigger function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to analysis_jobs
CREATE TRIGGER update_analysis_jobs_updated_at
  BEFORE UPDATE ON analysis_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function for worker to atomically claim a job
CREATE OR REPLACE FUNCTION claim_next_job(p_max_attempts int DEFAULT 3)
RETURNS TABLE (
  id uuid,
  input_type text,
  input_value text,
  normalized_input text,
  cache_key text,
  attempts int,
  request_id text
) AS $$
DECLARE
  v_job_id uuid;
  v_claim_id uuid := gen_random_uuid();
BEGIN
  -- Find and claim next available job
  SELECT j.id INTO v_job_id
  FROM analysis_jobs j
  WHERE j.status = 'queued'
    AND j.attempts < p_max_attempts
    AND (j.claimed_at IS NULL OR j.claimed_at < now() - interval '10 minutes')
  ORDER BY j.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- If no job found, return empty
  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  -- Update job to running
  UPDATE analysis_jobs
  SET
    status = 'running',
    claimed_at = now(),
    claim_id = v_claim_id,
    attempts = attempts + 1
  WHERE analysis_jobs.id = v_job_id;

  -- Return job details
  RETURN QUERY
  SELECT
    j.id,
    j.input_type,
    j.input_value,
    j.normalized_input,
    j.cache_key,
    j.attempts,
    j.request_id
  FROM analysis_jobs j
  WHERE j.id = v_job_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE analysis_jobs IS 'Job queue for Perplexity analysis - processed by worker service';
COMMENT ON COLUMN analysis_jobs.job_token IS 'Secret token for job status polling without JWT';
COMMENT ON COLUMN analysis_jobs.cache_key IS 'SHA256 hash for deduplication';
COMMENT ON COLUMN analysis_jobs.claim_id IS 'Unique ID for this processing attempt';
