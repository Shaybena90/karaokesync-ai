-- =====================================================================
-- KaraokeSync AI — automatic sync of words typed in the editor
-- The editor sends the words of one line plus the stretch of the song where
-- they are sung; the worker finds when each word is heard and writes the
-- timings into `result`. The editor applies them (so they can be undone) and
-- saves them through save_lyrics as usual: this table never touches the lyrics.
--
-- Same reliability model as processing_jobs (SKIP LOCKED claims, leases,
-- retries). Safe to run more than once.
-- =====================================================================

create table if not exists public.sync_jobs (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  words            jsonb not null,             -- ["word", ...] in song order
  window_start_ms  integer not null check (window_start_ms >= 0),
  window_end_ms    integer not null,
  language         text,
  status           public.job_status not null default 'queued',
  result           jsonb,                      -- [{ "start_ms", "end_ms", "confidence" }] — one per word
  attempts         smallint not null default 0,
  max_attempts     smallint not null default 2 check (max_attempts between 1 and 10),
  run_after        timestamptz not null default now(),
  locked_by        text,
  locked_until     timestamptz,
  error_code       text,
  created_at       timestamptz not null default now(),
  finished_at      timestamptz,
  updated_at       timestamptz not null default now(),
  constraint sync_jobs_window check (window_end_ms > window_start_ms and window_end_ms - window_start_ms <= 60000),
  constraint sync_jobs_words check (jsonb_typeof(words) = 'array' and jsonb_array_length(words) between 1 and 80)
);

create index if not exists sync_jobs_claim_idx on public.sync_jobs (run_after) where status in ('queued', 'running');
create index if not exists sync_jobs_user_created_idx on public.sync_jobs (user_id, created_at desc);

drop trigger if exists sync_jobs_updated_at on public.sync_jobs;
create trigger sync_jobs_updated_at before update on public.sync_jobs
  for each row execute function public.set_updated_at();

-- Browser: read own jobs only. Jobs are created by the API (service role).
alter table public.sync_jobs enable row level security;
revoke all on public.sync_jobs from anon, authenticated;
grant select on public.sync_jobs to authenticated;
drop policy if exists "sync_jobs: read own" on public.sync_jobs;
create policy "sync_jobs: read own" on public.sync_jobs
  for select to authenticated using (user_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.sync_jobs;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- Queue functions (service role only)
-- ---------------------------------------------------------------------
create or replace function public.claim_sync_job(p_worker_id text, p_lease_seconds integer default 120)
returns setof public.sync_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.sync_jobs;
begin
  update public.sync_jobs
     set status = 'failed', error_code = 'worker_lost', locked_by = null, locked_until = null, finished_at = now()
   where status = 'running' and locked_until < now() and attempts >= max_attempts;

  select * into v_job
    from public.sync_jobs
   where (status = 'queued' and run_after <= now())
      or (status = 'running' and locked_until < now() and attempts < max_attempts)
   order by run_after
   limit 1
   for update skip locked;
  if not found then
    return;
  end if;

  update public.sync_jobs
     set status = 'running', attempts = attempts + 1, locked_by = p_worker_id,
         locked_until = now() + make_interval(secs => p_lease_seconds), error_code = null
   where id = v_job.id
   returning * into v_job;
  return next v_job;
end;
$$;

create or replace function public.heartbeat_sync_job(p_job_id uuid, p_worker_id text, p_lease_seconds integer, p_progress integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sync_jobs
     set locked_until = now() + make_interval(secs => p_lease_seconds)
   where id = p_job_id and locked_by = p_worker_id and status = 'running';
  return found;
end;
$$;

create or replace function public.complete_sync_job(p_job_id uuid, p_worker_id text, p_result jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sync_jobs
     set status = 'succeeded', result = p_result, locked_by = null, locked_until = null, finished_at = now()
   where id = p_job_id and locked_by = p_worker_id and status = 'running'
     and jsonb_typeof(p_result) = 'array' and jsonb_array_length(p_result) = jsonb_array_length(words);
  return found;
end;
$$;

create or replace function public.fail_sync_job(
  p_job_id uuid, p_worker_id text, p_error_code text, p_retryable boolean, p_retry_delay_seconds integer default 5
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.sync_jobs;
begin
  select * into v_job from public.sync_jobs
   where id = p_job_id and locked_by = p_worker_id and status = 'running'
   for update;
  if not found then
    return;
  end if;
  if p_retryable and v_job.attempts < v_job.max_attempts then
    update public.sync_jobs
       set status = 'queued', locked_by = null, locked_until = null, error_code = left(p_error_code, 64),
           run_after = now() + make_interval(secs => p_retry_delay_seconds * v_job.attempts)
     where id = p_job_id;
  else
    update public.sync_jobs
       set status = 'failed', locked_by = null, locked_until = null,
           error_code = left(p_error_code, 64), finished_at = now()
     where id = p_job_id;
  end if;
end;
$$;

revoke all on function public.claim_sync_job(text, integer)                    from public, anon, authenticated;
revoke all on function public.heartbeat_sync_job(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_sync_job(uuid, text, jsonb)             from public, anon, authenticated;
revoke all on function public.fail_sync_job(uuid, text, text, boolean, integer) from public, anon, authenticated;
grant execute on function public.claim_sync_job(text, integer)                    to service_role;
grant execute on function public.heartbeat_sync_job(uuid, text, integer, integer) to service_role;
grant execute on function public.complete_sync_job(uuid, text, jsonb)             to service_role;
grant execute on function public.fail_sync_job(uuid, text, text, boolean, integer) to service_role;
