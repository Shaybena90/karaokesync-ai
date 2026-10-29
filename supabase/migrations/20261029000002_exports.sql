-- =====================================================================
-- KaraokeSync AI — stage 8: MP4 export queue
-- Same reliability model as processing_jobs (SKIP LOCKED claims, leases,
-- heartbeats, retries). Run in the Supabase SQL Editor after the previous files.
-- =====================================================================

-- One active MP4 export per project (double clicks cannot start two renders).
create unique index if not exists export_jobs_one_active_per_project
  on public.export_jobs (project_id)
  where status in ('queued', 'running');

create index if not exists export_jobs_claim_idx
  on public.export_jobs (run_after)
  where status in ('queued', 'running');

alter publication supabase_realtime add table public.export_jobs;

create or replace function public.claim_export_job(p_worker_id text, p_lease_seconds integer default 120)
returns setof public.export_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.export_jobs;
begin
  update public.export_jobs
     set status = 'failed', error_code = 'worker_lost', locked_by = null, locked_until = null, finished_at = now()
   where status = 'running' and locked_until < now() and attempts >= max_attempts;

  select * into v_job
    from public.export_jobs
   where (status = 'queued' and run_after <= now())
      or (status = 'running' and locked_until < now() and attempts < max_attempts)
   order by run_after
   limit 1
   for update skip locked;
  if not found then
    return;
  end if;

  update public.export_jobs
     set status = 'running', attempts = attempts + 1, locked_by = p_worker_id,
         locked_until = now() + make_interval(secs => p_lease_seconds), progress = 0, error_code = null
   where id = v_job.id
   returning * into v_job;
  return next v_job;
end;
$$;

create or replace function public.heartbeat_export_job(p_job_id uuid, p_worker_id text, p_lease_seconds integer, p_progress integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.export_jobs
     set locked_until = now() + make_interval(secs => p_lease_seconds),
         progress = greatest(0, least(100, p_progress))
   where id = p_job_id and locked_by = p_worker_id and status = 'running';
  return found;
end;
$$;

create or replace function public.complete_export_job(p_job_id uuid, p_worker_id text, p_output_path text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.export_jobs
     set status = 'succeeded', progress = 100, output_path = p_output_path,
         locked_by = null, locked_until = null, finished_at = now()
   where id = p_job_id and locked_by = p_worker_id and status = 'running';
  return found;
end;
$$;

create or replace function public.fail_export_job(
  p_job_id uuid, p_worker_id text, p_error_code text, p_retryable boolean, p_retry_delay_seconds integer default 30
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.export_jobs;
begin
  select * into v_job from public.export_jobs
   where id = p_job_id and locked_by = p_worker_id and status = 'running'
   for update;
  if not found then
    return;
  end if;
  if p_retryable and v_job.attempts < v_job.max_attempts then
    update public.export_jobs
       set status = 'queued', locked_by = null, locked_until = null, error_code = left(p_error_code, 64),
           run_after = now() + make_interval(secs => p_retry_delay_seconds * v_job.attempts)
     where id = p_job_id;
  else
    update public.export_jobs
       set status = 'failed', locked_by = null, locked_until = null,
           error_code = left(p_error_code, 64), finished_at = now()
     where id = p_job_id;
  end if;
end;
$$;

revoke all on function public.claim_export_job(text, integer)                    from public, anon, authenticated;
revoke all on function public.heartbeat_export_job(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_export_job(uuid, text, text)              from public, anon, authenticated;
revoke all on function public.fail_export_job(uuid, text, text, boolean, integer) from public, anon, authenticated;
grant execute on function public.claim_export_job(text, integer)                    to service_role;
grant execute on function public.heartbeat_export_job(uuid, text, integer, integer) to service_role;
grant execute on function public.complete_export_job(uuid, text, text)              to service_role;
grant execute on function public.fail_export_job(uuid, text, text, boolean, integer) to service_role;
