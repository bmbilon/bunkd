-- Migration: Add user_id and disambiguation fields to analysis_jobs
-- This enables: 1) History tab functionality, 2) Disambiguation flow

-- Add user_id column (nullable to support anonymous users and existing records)
ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS user_id uuid;

-- Add disambiguation columns (needed for the disambiguation flow to work)
ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS selected_candidate_id text;
ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS interpreted_as text;

-- Add index for efficient user history queries
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user_id ON analysis_jobs(user_id)
WHERE user_id IS NOT NULL;

-- Add composite index for user history with date ordering
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user_history ON analysis_jobs(user_id, created_at DESC)
WHERE user_id IS NOT NULL;

-- Note: We intentionally do NOT add a foreign key to auth.users because:
-- 1. Anonymous users have temporary UUIDs that may not persist
-- 2. We don't want history to break if a user account is deleted
-- 3. The edge function uses service role, which can't easily reference auth.users

-- Add RLS policy to allow users to read their own analysis history
-- (RLS is already enabled on the table from the original migration)
CREATE POLICY "Users can read own analysis jobs"
  ON analysis_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Update the claim_next_job function to include user_id and other new fields
CREATE OR REPLACE FUNCTION claim_next_job(p_max_attempts int DEFAULT 3)
RETURNS TABLE (
  id uuid,
  input_type text,
  input_value text,
  normalized_input text,
  cache_key text,
  attempts int,
  request_id text,
  user_id uuid,
  selected_candidate_id text,
  interpreted_as text
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
    j.request_id,
    j.user_id,
    j.selected_candidate_id,
    j.interpreted_as
  FROM analysis_jobs j
  WHERE j.id = v_job_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN analysis_jobs.user_id IS 'User ID from JWT token - enables history feature';
COMMENT ON COLUMN analysis_jobs.selected_candidate_id IS 'ID of disambiguation candidate selected by user';
COMMENT ON COLUMN analysis_jobs.interpreted_as IS 'Human-readable label of selected disambiguation';
