-- Re-enable RLS with Anonymous Auth support
-- This enables production-safe data isolation while allowing anonymous testing

-- Re-enable RLS on all tables
alter table analysis_jobs enable row level security;
alter table analysis_results enable row level security;
alter table analysis_sources enable row level security;
alter table product_inputs enable row level security;

-- Drop old policies if they exist
drop policy if exists "Users can read their own jobs" on analysis_jobs;
drop policy if exists "Users can insert their own jobs" on analysis_jobs;
drop policy if exists "Users can read their own results" on analysis_results;
drop policy if exists "Users can read their own sources" on analysis_sources;
drop policy if exists "Users can read their own inputs" on product_inputs;
drop policy if exists "Users can insert their own inputs" on product_inputs;

-- Analysis Jobs Policies
-- Allow authenticated (including anonymous) users to insert jobs
create policy "Authenticated users can insert jobs"
  on analysis_jobs for insert
  to authenticated
  with check (
    user_id = auth.uid() or user_id is null
  );

-- Allow users to read their own jobs
create policy "Users can read their own jobs"
  on analysis_jobs for select
  to authenticated
  using (
    user_id = auth.uid() or user_id is null
  );

-- Allow service role to update any job (for job processing)
create policy "Service role can update jobs"
  on analysis_jobs for update
  to service_role
  using (true);

-- Analysis Results Policies
-- Allow users to read results for their jobs
create policy "Users can read their own results"
  on analysis_results for select
  to authenticated
  using (
    exists (
      select 1 from analysis_jobs
      where analysis_jobs.id = analysis_results.job_id
      and (analysis_jobs.user_id = auth.uid() or analysis_jobs.user_id is null)
    )
  );

-- Allow service role to insert results
create policy "Service role can insert results"
  on analysis_results for insert
  to service_role
  with check (true);

-- Analysis Sources Policies
-- Allow users to read sources for their results
create policy "Users can read their own sources"
  on analysis_sources for select
  to authenticated
  using (
    exists (
      select 1 from analysis_results
      join analysis_jobs on analysis_jobs.id = analysis_results.job_id
      where analysis_results.id = analysis_sources.result_id
      and (analysis_jobs.user_id = auth.uid() or analysis_jobs.user_id is null)
    )
  );

-- Allow service role to insert sources
create policy "Service role can insert sources"
  on analysis_sources for insert
  to service_role
  with check (true);

-- Product Inputs Policies
-- Allow users to insert their own inputs
create policy "Users can insert their own inputs"
  on product_inputs for insert
  to authenticated
  with check (
    user_id = auth.uid() or user_id is null
  );

-- Allow users to read their own inputs
create policy "Users can read their own inputs"
  on product_inputs for select
  to authenticated
  using (
    user_id = auth.uid() or user_id is null
  );

-- Rubrics: Keep existing policy (everyone can read active rubrics)
-- No changes needed

-- Note: Anonymous auth must be enabled in Supabase dashboard:
-- Authentication > Providers > Anonymous Users > Enable
-- This creates authenticated sessions without requiring email/password
