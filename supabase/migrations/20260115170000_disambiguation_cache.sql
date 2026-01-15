-- Disambiguation cache table for ambiguous query resolution
-- Caches Perplexity disambiguation results for 48h to avoid duplicate API calls

CREATE TABLE IF NOT EXISTS disambiguation_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  query text NOT NULL,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for cache key lookups
CREATE INDEX IF NOT EXISTS idx_disambiguation_cache_key ON disambiguation_cache(cache_key);

-- Index for TTL cleanup (created_at)
CREATE INDEX IF NOT EXISTS idx_disambiguation_cache_created ON disambiguation_cache(created_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_disambiguation_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS disambiguation_cache_updated ON disambiguation_cache;
CREATE TRIGGER disambiguation_cache_updated
  BEFORE UPDATE ON disambiguation_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_disambiguation_cache_timestamp();

-- RLS: Allow service role full access (worker uses service role key)
ALTER TABLE disambiguation_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage disambiguation cache"
  ON disambiguation_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Cleanup function for expired entries (> 72h)
CREATE OR REPLACE FUNCTION cleanup_disambiguation_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM disambiguation_cache
  WHERE created_at < now() - INTERVAL '72 hours';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add selected_candidate_id to analysis_jobs for tracking user selection
ALTER TABLE analysis_jobs
ADD COLUMN IF NOT EXISTS selected_candidate_id text,
ADD COLUMN IF NOT EXISTS interpreted_as text;

COMMENT ON TABLE disambiguation_cache IS 'Cache for Perplexity disambiguation results to avoid duplicate API calls';
COMMENT ON COLUMN disambiguation_cache.cache_key IS 'Unique key based on normalized query (disambig:query)';
COMMENT ON COLUMN disambiguation_cache.candidates IS 'Array of disambiguation candidates with id, label, category_hint, confidence';
COMMENT ON COLUMN analysis_jobs.selected_candidate_id IS 'User-selected disambiguation candidate ID';
COMMENT ON COLUMN analysis_jobs.interpreted_as IS 'Human-readable label of selected disambiguation';
