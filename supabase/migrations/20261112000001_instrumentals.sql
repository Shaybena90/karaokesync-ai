-- =====================================================================
-- KaraokeSync AI — "melody only": the song without the singer's voice
-- The worker separates the vocals with Demucs and stores the rest of the
-- music (the instrumental) next to the song in the private audio bucket.
-- Each row is both the job and its result (output_path).
-- Same reliability model as processing_jobs. Safe to run more than once.
-- =====================================================================

create table if not exists public.instrumental_jobs (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  audio_file_id  uuid not null references public.audio_files (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  status         public.job_status not null default 'queued',
  progress       smallint not null default 0 check (progress between 0 and 100),
  attempts       smallint not null default 0,
  max_attempts   smallint not null default 2 check (max_attempts between 1 and 10),
  run_after      timestamptz not null default now(),
  locked_by      text,
  locked_until   timestamptz,
  output_path    text,                          -- "<user_id>/<project_id>/instrumental-<id>.mp3"
  error_code     text,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz,
  updated_at     timestamptz not null default now()
);

create unique index if not exists instrumental_jobs_one_active_per_project
  on public.instrumental_jobs (project_id) where status in ('queued', 'running');
create index if not exists instrumental_jobs_claim_idx
  on public.instrumental_jobs (run_after) where status in ('queued', 'running');
create index if not exists instrumental_jobs_project_idx on public.instrumental_jobs (project_id, created_at desc);

drop trigger if exists instrumental_jobs_updated_at on public.instrumental_jobs;
create trigger instrumental_jobs_updated_at before update on public.instrumental_jobs
  for each row execute function public.set_updated_at();

alter table public.instrumental_jobs enable row level security;
revoke all on public.instrumental_jobs from anon, authenticated;
grant select on public.instrumental_jobs to authenticated;
drop policy if exists "instrumental_jobs: read own" on public.instrumental_jobs;
create policy "instrumental_jobs: read own" on public.instrumental_jobs
  for select to authenticated using (user_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.instrumental_jobs;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- Queue functions (service role only)
-- ---------------------------------------------------------------------
create or replace function public.claim_instrumental_job(p_worker_id text, p_lease_seconds integer default 120)
returns setof public.instrumental_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.instrumental_jobs;
begin
  update public.instrumental_jobs
     set status = 'failed', error_code = 'worker_lost', locked_by = null, locked_until = null, finished_at = now()
   where status = 'running' and locked_until < now() and attempts >= max_attempts;

  select * into v_job
    from public.instrumental_jobs
   where (status = 'queued' and run_after <= now())
      or (status = 'running' and locked_until < now() and attempts < max_attempts)
   order by run_after
   limit 1
   for update skip locked;
  if not found then
    return;
  end if;

  update public.instrumental_jobs
     set status = 'running', attempts = attempts + 1, locked_by = p_worker_id,
         locked_until = now() + make_interval(secs => p_lease_seconds), progress = 0, error_code = null
   where id = v_job.id
   returning * into v_job;
  return next v_job;
end;
$$;

create or replace function public.heartbeat_instrumental_job(p_job_id uuid, p_worker_id text, p_lease_seconds integer, p_progress integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.instrumental_jobs
     set locked_until = now() + make_interval(secs => p_lease_seconds),
         progress = greatest(0, least(100, p_progress))
   where id = p_job_id and locked_by = p_worker_id and status = 'running';
  return found;
end;
$$;

create or replace function public.complete_instrumental_job(p_job_id uuid, p_worker_id text, p_output_path text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.instrumental_jobs
     set status = 'succeeded', progress = 100, output_path = p_output_path,
         locked_by = null, locked_until = null, finished_at = now()
   where id = p_job_id and locked_by = p_worker_id and status = 'running';
  return found;
end;
$$;

create or replace function public.fail_instrumental_job(
  p_job_id uuid, p_worker_id text, p_error_code text, p_retryable boolean, p_retry_delay_seconds integer default 30
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.instrumental_jobs;
begin
  select * into v_job from public.instrumental_jobs
   where id = p_job_id and locked_by = p_worker_id and status = 'running'
   for update;
  if not found then
    return;
  end if;
  if p_retryable and v_job.attempts < v_job.max_attempts then
    update public.instrumental_jobs
       set status = 'queued', locked_by = null, locked_until = null, error_code = left(p_error_code, 64),
           run_after = now() + make_interval(secs => p_retry_delay_seconds * v_job.attempts)
     where id = p_job_id;
  else
    update public.instrumental_jobs
       set status = 'failed', locked_by = null, locked_until = null,
           error_code = left(p_error_code, 64), finished_at = now()
     where id = p_job_id;
  end if;
end;
$$;

revoke all on function public.claim_instrumental_job(text, integer)                    from public, anon, authenticated;
revoke all on function public.heartbeat_instrumental_job(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_instrumental_job(uuid, text, text)              from public, anon, authenticated;
revoke all on function public.fail_instrumental_job(uuid, text, text, boolean, integer) from public, anon, authenticated;
grant execute on function public.claim_instrumental_job(text, integer)                    to service_role;
grant execute on function public.heartbeat_instrumental_job(uuid, text, integer, integer) to service_role;
grant execute on function public.complete_instrumental_job(uuid, text, text)              to service_role;
grant execute on function public.fail_instrumental_job(uuid, text, text, boolean, integer) to service_role;
