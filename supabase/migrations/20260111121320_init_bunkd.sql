-- Enable pgcrypto extension for gen_random_uuid()
create extension if not exists "pgcrypto";

-- Rubrics table (active rubric text + version)
create table rubrics (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  rubric_text text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for quickly finding active rubric
create index idx_rubrics_active on rubrics(is_active) where is_active = true;

-- Analysis jobs table (queue with status transitions)
create table analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  fingerprint text not null,
  input_data jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  rubric_version text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- Indexes for job queue operations
create index idx_jobs_status on analysis_jobs(status);
create index idx_jobs_fingerprint on analysis_jobs(fingerprint);
create index idx_jobs_user on analysis_jobs(user_id);
create index idx_jobs_created on analysis_jobs(created_at);

-- Analysis results table (cached outputs with TTL)
create table analysis_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references analysis_jobs(id) on delete cascade,
  fingerprint text not null,
  result_data jsonb not null,
  rubric_version text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Indexes for cache lookups
create unique index idx_results_fingerprint on analysis_results(fingerprint);
create index idx_results_expires on analysis_results(expires_at);
create index idx_results_job on analysis_results(job_id);

-- Analysis sources table (citations)
create table analysis_sources (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references analysis_results(id) on delete cascade,
  source_url text,
  source_title text,
  source_snippet text,
  source_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Index for retrieving sources in order
create index idx_sources_result on analysis_sources(result_id, source_order);

-- Product inputs table (user submission history - optional)
create table product_inputs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  input_type text not null check (input_type in ('url', 'text', 'image')),
  input_value text not null,
  job_id uuid references analysis_jobs(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Index for user history
create index idx_inputs_user on product_inputs(user_id, created_at desc);

-- RLS Policies
alter table rubrics enable row level security;
alter table analysis_jobs enable row level security;
alter table analysis_results enable row level security;
alter table analysis_sources enable row level security;
alter table product_inputs enable row level security;

-- Rubrics: Everyone can read active rubrics
create policy "Anyone can read active rubrics"
  on rubrics for select
  using (is_active = true);

-- Analysis jobs: Users can read their own jobs
create policy "Users can read their own jobs"
  on analysis_jobs for select
  using (auth.uid() = user_id);

-- Analysis jobs: Users can insert their own jobs
create policy "Users can insert their own jobs"
  on analysis_jobs for insert
  with check (auth.uid() = user_id);

-- Analysis results: Users can read results for their jobs (MVP - restrict to user_id)
create policy "Users can read their own results"
  on analysis_results for select
  using (
    exists (
      select 1 from analysis_jobs
      where analysis_jobs.id = analysis_results.job_id
      and analysis_jobs.user_id = auth.uid()
    )
  );

-- Analysis sources: Users can read sources for their results
create policy "Users can read their own sources"
  on analysis_sources for select
  using (
    exists (
      select 1 from analysis_results
      join analysis_jobs on analysis_jobs.id = analysis_results.job_id
      where analysis_results.id = analysis_sources.result_id
      and analysis_jobs.user_id = auth.uid()
    )
  );

-- Product inputs: Users can read their own inputs
create policy "Users can read their own inputs"
  on product_inputs for select
  using (auth.uid() = user_id);

-- Product inputs: Users can insert their own inputs
create policy "Users can insert their own inputs"
  on product_inputs for insert
  with check (auth.uid() = user_id);

-- Function to update updated_at timestamp
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
create trigger update_rubrics_updated_at
  before update on rubrics
  for each row execute function update_updated_at();

create trigger update_analysis_jobs_updated_at
  before update on analysis_jobs
  for each row execute function update_updated_at();

-- Insert default rubric (you can update this text)
insert into rubrics (version, rubric_text, is_active) values (
  'v1.0',
  'Analyze the product for objectivity, bias, and factual claims. Provide structured analysis with sources.',
  true
);

-- Function to acquire next job for processing (FOR UPDATE SKIP LOCKED pattern)
create or replace function acquire_next_job()
returns table (
  id uuid,
  user_id uuid,
  fingerprint text,
  input_data jsonb,
  status text,
  rubric_version text,
  created_at timestamptz
) as $$
begin
  return query
  update analysis_jobs
  set status = 'processing',
      started_at = now()
  where analysis_jobs.id = (
    select analysis_jobs.id
    from analysis_jobs
    where analysis_jobs.status = 'queued'
    order by analysis_jobs.created_at
    for update skip locked
    limit 1
  )
  returning
    analysis_jobs.id,
    analysis_jobs.user_id,
    analysis_jobs.fingerprint,
    analysis_jobs.input_data,
    analysis_jobs.status,
    analysis_jobs.rubric_version,
    analysis_jobs.created_at;
end;
$$ language plpgsql security definer;
