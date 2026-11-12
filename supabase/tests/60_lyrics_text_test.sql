-- Pasted lyrics column.
\set ON_ERROR_STOP on
set client_min_messages = warning;

do $$
declare v_project uuid;
begin
  select id into v_project from public.projects limit 1;
  update public.projects set lyrics_text = E'שלום עולם\nזה שיר' where id = v_project;
  begin
    update public.projects set lyrics_text = repeat('x', 20001) where id = v_project;
    assert false, 'lyrics longer than 20000 characters accepted';
  exception when check_violation then null;
  end;
end $$;

\ir ../migrations/20261113000001_lyrics_text.sql

set role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  assert (select lyrics_text from public.projects limit 1) is not null, 'owner can read the pasted lyrics';
  begin
    update public.projects set lyrics_text = 'x';
    assert false, 'browser changed the pasted lyrics directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo 'LYRICS TEXT TESTS PASSED'
