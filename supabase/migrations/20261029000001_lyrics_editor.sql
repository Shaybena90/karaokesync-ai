-- =====================================================================
-- KaraokeSync AI — stage 7: lyrics editor
--
-- The editor saves the whole lyrics document through ONE function so that
--   * every save is atomic (lines + words replaced in a single transaction),
--   * the data is validated in the database, not only in the browser,
--   * two open tabs/devices cannot silently overwrite each other
--     (optimistic concurrency with projects.lyrics_version).
-- Run this in the Supabase SQL Editor after the first migration.
-- =====================================================================

alter table public.projects add column if not exists lyrics_version integer not null default 0;

-- Lyrics are now written only through save_lyrics (validated), not row by row.
revoke insert, update, delete on public.lyric_lines, public.lyric_words from authenticated;

-- p_lines = [ { "id": uuid, "words": [ { "id": uuid, "text", "start_ms", "end_ms", "confidence" } ] } ]
-- Returns the new lyrics_version.
create or replace function public.save_lyrics(p_project_id uuid, p_expected_version integer, p_lines jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
  v_line jsonb;
  v_word jsonb;
  v_line_id uuid;
  v_line_index integer := 0;
  v_word_index integer := 0;
  v_text text;
  v_start integer;
  v_end integer;
  v_min integer;
  v_max integer;
  v_prev_start integer := 0;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found or v_project.user_id is distinct from auth.uid() then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_project.status not in ('ready', 'expired') then
    raise exception 'not_editable' using errcode = 'P0001';
  end if;
  if v_project.lyrics_version <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 2000 then
    raise exception 'invalid_lyrics' using errcode = '22023';
  end if;

  delete from public.lyric_lines where project_id = p_project_id; -- words cascade

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line -> 'words') <> 'array' or jsonb_array_length(v_line -> 'words') = 0 then
      continue; -- empty lines are dropped
    end if;

    v_line_id := coalesce((v_line ->> 'id')::uuid, gen_random_uuid());
    v_min := null;
    v_max := null;
    insert into public.lyric_lines (id, project_id, line_index, start_ms, end_ms)
    values (v_line_id, p_project_id, v_line_index, 0, 0);

    for v_word in select * from jsonb_array_elements(v_line -> 'words') loop
      v_text := btrim(v_word ->> 'text');
      v_start := (v_word ->> 'start_ms')::integer;
      v_end := (v_word ->> 'end_ms')::integer;
      if v_text is null or v_text = '' or char_length(v_text) > 100
         or v_start is null or v_end is null or v_start < 0 or v_end < v_start
         or v_start < v_prev_start then
        raise exception 'invalid_lyrics' using errcode = '22023';
      end if;
      insert into public.lyric_words (id, project_id, line_id, text, start_ms, end_ms, word_index, confidence)
      values (coalesce((v_word ->> 'id')::uuid, gen_random_uuid()), p_project_id, v_line_id, v_text,
              v_start, v_end, v_word_index, (v_word ->> 'confidence')::real);
      v_prev_start := v_start;
      v_min := least(coalesce(v_min, v_start), v_start);
      v_max := greatest(coalesce(v_max, v_end), v_end);
      v_word_index := v_word_index + 1;
      if v_word_index > 20000 then
        raise exception 'invalid_lyrics' using errcode = '22023';
      end if;
    end loop;

    update public.lyric_lines set start_ms = v_min, end_ms = v_max where id = v_line_id;
    v_line_index := v_line_index + 1;
  end loop;

  update public.projects set lyrics_version = lyrics_version + 1
   where id = p_project_id
   returning lyrics_version into v_project.lyrics_version;
  return v_project.lyrics_version;
end;
$$;

revoke all on function public.save_lyrics(uuid, integer, jsonb) from public, anon;
grant execute on function public.save_lyrics(uuid, integer, jsonb) to authenticated;

-- A new AI result also bumps the version, so an editor open on old data
-- cannot overwrite it.
create or replace function public.bump_lyrics_version_on_ready()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'ready' and old.status is distinct from 'ready' then
    new.lyrics_version := old.lyrics_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_bump_lyrics_version on public.projects;
create trigger projects_bump_lyrics_version before update on public.projects
  for each row execute function public.bump_lyrics_version_on_ready();
