-- Background media: constraints, private bucket, RLS.
\set ON_ERROR_STOP on
set client_min_messages = warning;

do $$
declare
  v_project uuid;
begin
  select id into v_project from public.projects limit 1;
  insert into public.background_media (project_id, user_id, storage_path, original_name, format, size_bytes)
    values (v_project, '00000000-0000-0000-0000-00000000000a', 'a/p/1.gif', 'loop.gif', 'gif', 1000);

  begin
    insert into public.background_media (project_id, user_id, storage_path, original_name, format, size_bytes)
      values (v_project, '00000000-0000-0000-0000-00000000000a', 'a/p/2.exe', 'x.exe', 'exe', 10);
    assert false, 'unknown format accepted';
  exception when check_violation then null;
  end;

  assert (select public = false and file_size_limit = 31457280 from storage.buckets where id = 'backgrounds'),
    'backgrounds bucket must be private with a 30 MB limit';
end $$;

-- the migration can be run again without errors
\ir ../migrations/20261111000001_backgrounds.sql

set role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  assert (select count(*) from public.background_media) = 0, 'bob sees alice backgrounds';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  assert (select count(*) from public.background_media) = 1;
  begin
    insert into public.background_media (project_id, user_id, storage_path, original_name, format, size_bytes)
      select id, auth.uid(), 'x/y/z.gif', 'z.gif', 'gif', 1 from public.projects;
    assert false, 'browser created a background row directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.background_media set status = 'verified';
    assert false, 'browser verified a background itself';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo 'BACKGROUND TESTS PASSED'
