-- =====================================================================
-- KaraokeSync AI — video backgrounds (animated GIF, short video or image)
-- A user uploads a file for a project; the style lists which file shows when
-- ({ "backgrounds": [{ "media_id", "start_ms", "end_ms" }] }). The worker only
-- renders files that are verified and belong to the same project.
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.background_media (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  storage_path   text not null unique,   -- "<user_id>/<project_id>/<id>.<ext>"
  original_name  text not null check (char_length(original_name) <= 255),
  format         text not null check (format in ('gif', 'mp4', 'webm', 'mov', 'png', 'jpg')),
  kind           text check (kind in ('image', 'video')),   -- known after verification
  size_bytes     bigint not null check (size_bytes > 0),
  duration_ms    integer check (duration_ms > 0),          -- null for still images
  width          integer check (width > 0),
  height         integer check (height > 0),
  status         public.audio_status not null default 'pending',
  error_code     text,
  created_at     timestamptz not null default now(),
  verified_at    timestamptz
);

create index if not exists background_media_project_idx on public.background_media (project_id, created_at);
create index if not exists background_media_user_created_idx on public.background_media (user_id, created_at desc);

-- Browser: read own rows only. Rows are created/verified/deleted by the API.
alter table public.background_media enable row level security;
revoke all on public.background_media from anon, authenticated;
grant select on public.background_media to authenticated;
drop policy if exists "background_media: read own" on public.background_media;
create policy "background_media: read own" on public.background_media
  for select to authenticated using (user_id = auth.uid());

-- Private bucket. The browser may only read (signed URLs) its own folder;
-- uploads use one-time signed upload URLs issued by the API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backgrounds', 'backgrounds', false, 31457280, -- 30 MB
        array['image/gif', 'image/png', 'image/jpeg', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "backgrounds: read own folder" on storage.objects;
create policy "backgrounds: read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'backgrounds' and (storage.foldername(name))[1] = auth.uid()::text);
