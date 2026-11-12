-- =====================================================================
-- KaraokeSync AI — processing server status and remote pause
-- Each worker checks in every few seconds (worker_checkin): the website can
-- show whether one is online, and the owner can pause/resume processing from
-- the phone (the API checks the owner; browsers have no access here).
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.workers (
  id          text primary key,          -- "<computer>-<pid>-<random>"
  started_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  version     text,
  device      text,                      -- e.g. "GPU (NVIDIA RTX A5000)" / "CPU"
  activity    text                       -- "idle", "processing", "export", ... (never song titles)
);

create table if not exists public.worker_control (
  id          smallint primary key default 1 check (id = 1),
  paused      boolean not null default false,
  updated_at  timestamptz not null default now()
);
insert into public.worker_control (id) values (1) on conflict (id) do nothing;

alter table public.workers enable row level security;
alter table public.worker_control enable row level security;
revoke all on public.workers, public.worker_control from anon, authenticated;

-- One call does both: "I am alive, doing X" and "should I take new jobs?"
create or replace function public.worker_checkin(p_worker_id text, p_version text, p_device text, p_activity text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workers (id, version, device, activity)
  values (left(p_worker_id, 120), left(p_version, 80), left(p_device, 120), left(p_activity, 40))
  on conflict (id) do update
    set last_seen = now(), version = excluded.version, device = excluded.device, activity = excluded.activity;
  -- Forget workers that have been gone for a week.
  delete from public.workers where last_seen < now() - interval '7 days';
  return (select paused from public.worker_control where id = 1);
end;
$$;

revoke all on function public.worker_checkin(text, text, text, text) from public, anon, authenticated;
grant execute on function public.worker_checkin(text, text, text, text) to service_role;
