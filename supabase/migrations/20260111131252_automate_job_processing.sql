-- Enable pg_cron extension for scheduled jobs
create extension if not exists pg_cron;

-- Create a function to trigger job processing via pg_net HTTP request
create or replace function trigger_job_processing()
returns void
language plpgsql
security definer
as $$
declare
  request_id bigint;
  function_url text;
  service_key text;
begin
  -- Get Supabase project URL and service key from secrets
  -- These should be set via: supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
  function_url := 'https://qmhqfmkbvyeabftpchex.supabase.co/functions/v1/run_job';
  service_key := current_setting('app.settings.service_role_key', true);

  -- If service key not set via app.settings, use the one from vault (Supabase managed)
  if service_key is null then
    service_key := current_setting('supabase.service_role_key', true);
  end if;

  -- Make async HTTP POST to run_job endpoint using pg_net
  select net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(service_key, '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into request_id;

  -- Optionally log (commented out for production)
  -- raise notice 'Triggered job processing, request_id: %', request_id;
exception
  when others then
    -- Log error but don't fail
    raise warning 'Failed to trigger job processing: %', SQLERRM;
end;
$$;

-- Schedule the function to run every minute
-- Note: pg_cron typically doesn't support seconds granularity in standard cron syntax
-- Using every minute (can process multiple jobs per call if needed)
select cron.schedule(
  'process-analysis-jobs',  -- job name
  '* * * * *',               -- every minute (most reliable across pg_cron versions)
  $$SELECT trigger_job_processing()$$
);

-- Alternative: If you want every 30 seconds and your pg_cron supports it:
-- select cron.schedule('process-analysis-jobs', '*/30 * * * * *', 'SELECT trigger_job_processing()');

-- To view scheduled jobs:
-- SELECT * FROM cron.job;

-- To unschedule if needed:
-- SELECT cron.unschedule('process-analysis-jobs');

-- Note: The run_job function processes one job per call, so calling every minute
-- should be sufficient for most workloads. Can be adjusted based on volume.
