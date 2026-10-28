-- =====================================================================
-- KaraokeSync AI — initial schema
-- Run this once in the Supabase SQL Editor (or via `supabase db push`).
--
-- Security model:
--   * Every table has Row Level Security enabled.
--   * The browser (anon / authenticated roles) can only READ its own rows,
--     and can only WRITE where explicitly granted (titles, styles, lyrics).
--   * Project creation, job creation, status changes and deletions happen in
--     the Python API / worker using the service role, which bypasses RLS and
--     re-checks ownership itself.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.project_status as enum (
  'awaiting_upload', -- row created, browser is uploading the file
  'queued',          -- file verified, waiting for a worker
  'processing',      -- a worker is running the AI pipeline
  'ready',           -- lyrics + timings available
  'failed',          -- pipeline failed permanently (user may retry)
  'expired'          -- audio removed by the retention policy
);

create type public.audio_status as enum ('pending', 'verified', 'rejected', 'deleted');

create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');

create type public.export_format as enum ('srt', 'lrc', 'ass', 'mp4');

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale       text not null default 'he' check (locale in ('he', 'en')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------
create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  status        public.project_status not null default 'awaiting_upload',
  language      text,                      -- ISO-639-1 detected by the pipeline
  error_code    text,                      -- machine-readable, translated in the UI
  style         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index projects_user_created_idx on public.projects (user_id, created_at desc);

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- audio_files
-- ---------------------------------------------------------------------
create table public.audio_files (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  storage_path   text not null unique,     -- "<user_id>/<project_id>/<audio_id>.<ext>"
  original_name  text not null check (char_length(original_name) <= 255),
  declared_mime  text not null,            -- what the browser claimed
  detected_format text,                    -- what the server actually found (mp3/wav/m4a)
  size_bytes     bigint not null check (size_bytes > 0),
  duration_ms    integer check (duration_ms > 0),
  status         public.audio_status not null default 'pending',
  created_at     timestamptz not null default now(),
  verified_at    timestamptz,
  deleted_at     timestamptz
);

create index audio_files_project_idx on public.audio_files (project_id);
create index audio_files_retention_idx on public.audio_files (created_at) where status <> 'deleted';

-- ---------------------------------------------------------------------
-- processing_jobs — a Postgres-backed job queue
--
-- Reliability guarantees:
--   * claim uses FOR UPDATE SKIP LOCKED  -> two workers never get the same job
--   * a claimed job holds a lease (locked_until). Workers send heartbeats.
--     If a worker crashes the lease expires and another worker re-claims it.
--   * attempts / max_attempts + run_after give retries with back-off.
--   * a partial unique index forbids two active jobs for the same audio file.
-- ---------------------------------------------------------------------
create table public.processing_jobs (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  audio_file_id  uuid not null references public.audio_files (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  status         public.job_status not null default 'queued',
  stage          text not null default 'queued',
  progress       smallint not null default 0 check (progress between 0 and 100),
  attempts       smallint not null default 0,
  max_attempts   smallint not null default 3 check (max_attempts between 1 and 10),
  run_after      timestamptz not null default now(),
  locked_by      text,
  locked_until   timestamptz,
  error_code     text,
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  updated_at     timestamptz not null default now()
);

create unique index processing_jobs_one_active_per_audio
  on public.processing_jobs (audio_file_id)
  where status in ('queued', 'running');

create index processing_jobs_claim_idx
  on public.processing_jobs (run_after)
  where status in ('queued', 'running');

create index processing_jobs_project_idx on public.processing_jobs (project_id, created_at desc);

create trigger processing_jobs_updated_at before update on public.processing_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- lyric_lines / lyric_words
-- ---------------------------------------------------------------------
create table public.lyric_lines (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  line_index  integer not null check (line_index >= 0),
  start_ms    integer not null check (start_ms >= 0),
  end_ms      integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint lyric_lines_time_order check (end_ms >= start_ms),
  constraint lyric_lines_unique_index unique (project_id, line_index) deferrable initially deferred
);

create trigger lyric_lines_updated_at before update on public.lyric_lines
  for each row execute function public.set_updated_at();

create table public.lyric_words (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  line_id     uuid not null references public.lyric_lines (id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 100),
  start_ms    integer not null check (start_ms >= 0),
  end_ms      integer not null,
  word_index  integer not null check (word_index >= 0), -- order within the whole song
  confidence  real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint lyric_words_time_order check (end_ms >= start_ms),
  constraint lyric_words_unique_index unique (project_id, word_index) deferrable initially deferred
);

create index lyric_words_line_idx on public.lyric_words (line_id);
create index lyric_words_project_time_idx on public.lyric_words (project_id, start_ms);

create trigger lyric_words_updated_at before update on public.lyric_words
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- export_jobs (implemented in stage 8; same queue semantics as processing_jobs)
-- ---------------------------------------------------------------------
create table public.export_jobs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  format        public.export_format not null,
  options       jsonb not null default '{}'::jsonb, -- aspect ratio, resolution, style snapshot
  status        public.job_status not null default 'queued',
  progress      smallint not null default 0 check (progress between 0 and 100),
  attempts      smallint not null default 0,
  max_attempts  smallint not null default 2,
  run_after     timestamptz not null default now(),
  locked_by     text,
  locked_until  timestamptz,
  output_path   text,
  error_code    text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz,
  updated_at    timestamptz not null default now()
);

create index export_jobs_project_idx on public.export_jobs (project_id, created_at desc);

create trigger export_jobs_updated_at before update on public.export_jobs
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.audio_files     enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.lyric_lines     enable row level security;
alter table public.lyric_words     enable row level security;
alter table public.export_jobs     enable row level security;

-- Start from zero privileges for browser roles, then grant the minimum.
revoke all on public.profiles, public.projects, public.audio_files, public.processing_jobs,
              public.lyric_lines, public.lyric_words, public.export_jobs
  from anon, authenticated;

grant select on public.profiles, public.projects, public.audio_files, public.processing_jobs,
                public.lyric_lines, public.lyric_words, public.export_jobs
  to authenticated;

-- Only "safe" columns are editable from the browser.
grant update (display_name, locale) on public.profiles to authenticated;
grant update (title, style)         on public.projects to authenticated;
-- The karaoke editor (stage 7) edits lyrics directly, protected by RLS below.
grant insert, update, delete on public.lyric_lines, public.lyric_words to authenticated;

create policy "profiles: own row" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: update own row" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "projects: read own" on public.projects
  for select to authenticated using (user_id = auth.uid());
create policy "projects: update own" on public.projects
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "audio_files: read own" on public.audio_files
  for select to authenticated using (user_id = auth.uid());

create policy "processing_jobs: read own" on public.processing_jobs
  for select to authenticated using (user_id = auth.uid());

create policy "export_jobs: read own" on public.export_jobs
  for select to authenticated using (user_id = auth.uid());

create or replace function public.owns_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.projects where id = p_project_id and user_id = auth.uid());
$$;

create policy "lyric_lines: own project" on public.lyric_lines
  for all to authenticated
  using (public.owns_project(project_id))
  with check (public.owns_project(project_id));

create policy "lyric_words: own project" on public.lyric_words
  for all to authenticated
  using (public.owns_project(project_id))
  with check (
    public.owns_project(project_id)
    and exists (select 1 from public.lyric_lines l where l.id = line_id and l.project_id = lyric_words.project_id)
  );

-- =====================================================================
-- Queue functions (callable ONLY by the service role = the worker)
-- =====================================================================

-- Atomically claim the next runnable job.
-- A job is runnable when it is queued and due, or when it is "running" but its
-- lease has expired (the previous worker crashed or lost connectivity).
create or replace function public.claim_processing_job(p_worker_id text, p_lease_seconds integer default 120)
returns setof public.processing_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.processing_jobs;
begin
  -- Jobs whose lease expired and that have no attempts left are failed for good.
  with dead as (
    update public.processing_jobs
       set status = 'failed', error_code = 'worker_lost', locked_by = null,
           locked_until = null, finished_at = now()
     where status = 'running' and locked_until < now() and attempts >= max_attempts
     returning project_id
  )
  update public.projects p set status = 'failed', error_code = 'worker_lost'
    from dead where p.id = dead.project_id;

  select * into v_job
    from public.processing_jobs
   where (status = 'queued' and run_after <= now())
      or (status = 'running' and locked_until < now() and attempts < max_attempts)
   order by run_after
   limit 1
   for update skip locked;

  if not found then
    return;
  end if;

  update public.processing_jobs
     set status = 'running',
         attempts = attempts + 1,
         locked_by = p_worker_id,
         locked_until = now() + make_interval(secs => p_lease_seconds),
         started_at = coalesce(started_at, now()),
         stage = 'starting',
         error_code = null
   where id = v_job.id
   returning * into v_job;

  update public.projects set status = 'processing', error_code = null where id = v_job.project_id;

  return next v_job;
end;
$$;

-- Extend the lease and report progress. Returns false if this worker no longer
-- owns the job (e.g. it was re-claimed after a long pause) — the worker must stop.
create or replace function public.heartbeat_processing_job(
  p_job_id uuid, p_worker_id text, p_lease_seconds integer, p_stage text, p_progress integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.processing_jobs
     set locked_until = now() + make_interval(secs => p_lease_seconds),
         stage = left(p_stage, 64),
         progress = greatest(0, least(100, p_progress))
   where id = p_job_id and locked_by = p_worker_id and status = 'running';
  return found;
end;
$$;

-- Save the alignment result and finish the job in ONE transaction.
-- p_result = { "language": "he", "lines": [ { "start_ms", "end_ms",
--              "words": [ { "text", "start_ms", "end_ms", "confidence" } ] } ] }
create or replace function public.complete_processing_job(p_job_id uuid, p_worker_id text, p_result jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.processing_jobs;
  v_line jsonb;
  v_word jsonb;
  v_line_id uuid;
  v_line_index integer := 0;
  v_word_index integer := 0;
begin
  select * into v_job from public.processing_jobs
   where id = p_job_id and locked_by = p_worker_id and status = 'running'
   for update;
  if not found then
    return false;
  end if;

  delete from public.lyric_lines where project_id = v_job.project_id;

  for v_line in select * from jsonb_array_elements(p_result -> 'lines') loop
    insert into public.lyric_lines (project_id, line_index, start_ms, end_ms)
    values (v_job.project_id, v_line_index, (v_line ->> 'start_ms')::int, (v_line ->> 'end_ms')::int)
    returning id into v_line_id;

    for v_word in select * from jsonb_array_elements(v_line -> 'words') loop
      insert into public.lyric_words (project_id, line_id, text, start_ms, end_ms, word_index, confidence)
      values (v_job.project_id, v_line_id, v_word ->> 'text', (v_word ->> 'start_ms')::int,
              (v_word ->> 'end_ms')::int, v_word_index, (v_word ->> 'confidence')::real);
      v_word_index := v_word_index + 1;
    end loop;
    v_line_index := v_line_index + 1;
  end loop;

  update public.processing_jobs
     set status = 'succeeded', stage = 'done', progress = 100, locked_by = null,
         locked_until = null, finished_at = now()
   where id = p_job_id;

  update public.projects
     set status = 'ready', language = p_result ->> 'language', error_code = null
   where id = v_job.project_id;

  return true;
end;
$$;

-- Record a failure. Retryable failures go back to the queue with back-off
-- until max_attempts is reached.
create or replace function public.fail_processing_job(
  p_job_id uuid, p_worker_id text, p_error_code text, p_retryable boolean, p_retry_delay_seconds integer default 30
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.processing_jobs;
begin
  select * into v_job from public.processing_jobs
   where id = p_job_id and locked_by = p_worker_id and status = 'running'
   for update;
  if not found then
    return;
  end if;

  if p_retryable and v_job.attempts < v_job.max_attempts then
    update public.processing_jobs
       set status = 'queued', locked_by = null, locked_until = null, stage = 'retry_wait',
           error_code = left(p_error_code, 64),
           run_after = now() + make_interval(secs => p_retry_delay_seconds * v_job.attempts)
     where id = p_job_id;
    update public.projects set status = 'queued' where id = v_job.project_id;
  else
    update public.processing_jobs
       set status = 'failed', locked_by = null, locked_until = null,
           error_code = left(p_error_code, 64), finished_at = now()
     where id = p_job_id;
    update public.projects set status = 'failed', error_code = left(p_error_code, 64)
     where id = v_job.project_id;
  end if;
end;
$$;

revoke all on function public.claim_processing_job(text, integer)                         from public, anon, authenticated;
revoke all on function public.heartbeat_processing_job(uuid, text, integer, text, integer) from public, anon, authenticated;
revoke all on function public.complete_processing_job(uuid, text, jsonb)                  from public, anon, authenticated;
revoke all on function public.fail_processing_job(uuid, text, text, boolean, integer)     from public, anon, authenticated;
grant execute on function public.claim_processing_job(text, integer)                         to service_role;
grant execute on function public.heartbeat_processing_job(uuid, text, integer, text, integer) to service_role;
grant execute on function public.complete_processing_job(uuid, text, jsonb)                  to service_role;
grant execute on function public.fail_processing_job(uuid, text, text, boolean, integer)     to service_role;

-- =====================================================================
-- Storage: private buckets
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('audio', 'audio', false, 52428800, -- 50 MB hard ceiling; the app limit is set in .env
   array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
         'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac']),
  ('exports', 'exports', false, 524288000, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Users may READ (and create short-lived signed URLs for) objects in their own
-- folder only. Uploads use one-time signed upload URLs issued by the API, and
-- deletions go through the API, so no insert/update/delete policies exist.
create policy "audio: read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "exports: read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- Realtime: let the UI receive live status updates (RLS still applies)
-- =====================================================================
alter publication supabase_realtime add table public.projects, public.processing_jobs;
