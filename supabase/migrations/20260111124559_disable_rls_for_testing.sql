-- Temporarily disable RLS for testing
-- WARNING: This allows unauthenticated access to all data
-- Re-enable RLS before deploying to production

alter table analysis_jobs disable row level security;
alter table analysis_results disable row level security;
alter table analysis_sources disable row level security;
alter table product_inputs disable row level security;

-- Note: rubrics table keeps RLS enabled since everyone should read active rubrics anyway
