-- Behavioural tests for the job queue and Row Level Security.
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com');

do $$
declare
  v_project uuid; v_audio uuid; v_job public.processing_jobs; v_job2 public.processing_jobs;
  v_ok boolean; v_count int;
begin
  -- profiles are created automatically
  select count(*) into v_count from public.profiles;
  assert v_count = 2, 'profiles trigger';

  insert into public.projects (user_id, title) values ('00000000-0000-0000-0000-00000000000a', 'Song')
    returning id into v_project;
  insert into public.audio_files (project_id, user_id, storage_path, original_name, declared_mime, size_bytes, status)
    values (v_project, '00000000-0000-0000-0000-00000000000a', 'a/p/x.mp3', 'x.mp3', 'audio/mpeg', 10, 'verified')
    returning id into v_audio;
  insert into public.processing_jobs (project_id, audio_file_id, user_id)
    values (v_project, v_audio, '00000000-0000-0000-0000-00000000000a');

  -- duplicate active job is impossible
  begin
    insert into public.processing_jobs (project_id, audio_file_id, user_id)
      values (v_project, v_audio, '00000000-0000-0000-0000-00000000000a');
    assert false, 'duplicate job was allowed';
  exception when unique_violation then null;
  end;

  -- claim gives the job once
  select * into v_job from public.claim_processing_job('w1', 60);
  assert v_job.id is not null and v_job.attempts = 1, 'first claim';
  select * into v_job2 from public.claim_processing_job('w2', 60);
  assert v_job2.id is null, 'job must not be claimed twice';
  assert (select status from public.projects where id = v_project) = 'processing';

  -- heartbeat only works for the owner
  assert public.heartbeat_processing_job(v_job.id, 'w1', 60, 'transcribing', 50), 'owner heartbeat';
  assert not public.heartbeat_processing_job(v_job.id, 'w2', 60, 'x', 1), 'foreign heartbeat';

  -- crash recovery: an expired lease is re-claimed by another worker
  update public.processing_jobs set locked_until = now() - interval '1 second' where id = v_job.id;
  select * into v_job2 from public.claim_processing_job('w2', 60);
  assert v_job2.id = v_job.id and v_job2.attempts = 2 and v_job2.locked_by = 'w2', 'reclaim after crash';
  -- the crashed worker can no longer complete it
  assert not public.complete_processing_job(v_job.id, 'w1', '{"language":"he","lines":[]}'), 'stale completion';

  -- retryable failure goes back to the queue with back-off
  perform public.fail_processing_job(v_job.id, 'w2', 'internal_error', true, 30);
  select * into v_job from public.processing_jobs where id = v_job.id;
  assert v_job.status = 'queued' and v_job.run_after > now(), 'retry with backoff';
  select * into v_job2 from public.claim_processing_job('w3', 60);
  assert v_job2.id is null, 'not claimable before run_after';

  update public.processing_jobs set run_after = now() where id = v_job.id;
  select * into v_job from public.claim_processing_job('w3', 60);
  assert v_job.attempts = 3;

  -- complete stores lines + words atomically
  v_ok := public.complete_processing_job(v_job.id, 'w3',
    '{"language":"he","lines":[{"start_ms":0,"end_ms":900,"words":[
       {"text":"שלום","start_ms":0,"end_ms":400,"confidence":0.9},
       {"text":"עולם","start_ms":450,"end_ms":900,"confidence":null}]},
     {"start_ms":1000,"end_ms":1500,"words":[{"text":"שיר","start_ms":1000,"end_ms":1500,"confidence":0.5}]}]}');
  assert v_ok, 'complete';
  assert (select status from public.projects where id = v_project) = 'ready';
  assert (select language from public.projects where id = v_project) = 'he';
  assert (select count(*) from public.lyric_lines where project_id = v_project) = 2;
  assert (select string_agg(text, ' ' order by word_index) from public.lyric_words where project_id = v_project) = 'שלום עולם שיר';

  -- a new job can be created after the previous one finished
  insert into public.processing_jobs (project_id, audio_file_id, user_id, max_attempts)
    values (v_project, v_audio, '00000000-0000-0000-0000-00000000000a', 1);
  select * into v_job from public.claim_processing_job('w4', 60);
  -- crash with no attempts left -> failed permanently
  update public.processing_jobs set locked_until = now() - interval '1 second' where id = v_job.id;
  select * into v_job2 from public.claim_processing_job('w5', 60);
  assert v_job2.id is null;
  assert (select status from public.processing_jobs where id = v_job.id) = 'failed';
  assert (select error_code from public.projects where id = v_project) = 'worker_lost';
end $$;

-- ---------------------------------------------------------------- RLS
-- Bob must not see or change Alice's data.
set role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false); end $$;
do $$ begin
  assert (select count(*) from public.projects) = 0, 'bob sees alice projects';
  assert (select count(*) from public.lyric_words) = 0, 'bob sees alice words';
  update public.projects set title = 'hacked';
  assert not found, 'bob updated alice project';
  begin
    delete from public.lyric_words;
    assert false, 'bob deleted alice words';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Browser roles cannot change status or call queue functions.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false); end $$;
do $$ begin
  assert (select count(*) from public.projects) = 1, 'alice sees her project';
  update public.projects set title = 'My song';
  assert found, 'alice can rename';
  begin
    update public.projects set status = 'ready';
    assert false, 'status must not be writable from the browser';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.projects (user_id, title) values (auth.uid(), 'x');
    assert false, 'projects must be created through the API';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_processing_job('evil', 60);
    assert false, 'queue functions must be service-role only';
  exception when insufficient_privilege then null;
  end;
  -- Lyrics can only be changed through save_lyrics (validated), not row by row.
  begin
    update public.lyric_words set text = 'x' where word_index = 0;
    assert false, 'direct word update must be blocked';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ------------------------------------------------------- save_lyrics (editor)
do $$
declare
  v_project uuid;
  v_version int;
  v_new int;
begin
  select id, lyrics_version into v_project, v_version from public.projects limit 1;
  -- the project must be "ready" to be edited (it failed in the queue test above)
  reset role;
  update public.projects set status = 'ready' where id = v_project;
  select lyrics_version into v_version from public.projects where id = v_project;
  set role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

  v_new := public.save_lyrics(v_project, v_version, '[
    {"id":"10000000-0000-0000-0000-000000000001","words":[
      {"id":"20000000-0000-0000-0000-000000000001","text":" שלום ","start_ms":100,"end_ms":500,"confidence":1},
      {"id":"20000000-0000-0000-0000-000000000002","text":"עולם","start_ms":600,"end_ms":900,"confidence":null}]},
    {"id":"10000000-0000-0000-0000-000000000002","words":[]},
    {"id":"10000000-0000-0000-0000-000000000003","words":[
      {"id":"20000000-0000-0000-0000-000000000003","text":"שיר","start_ms":1000,"end_ms":1500,"confidence":0.4}]}
  ]');
  assert v_new = v_version + 1, 'version increments';
  assert (select count(*) from public.lyric_lines where project_id = v_project) = 2, 'empty line dropped';
  assert (select start_ms || '-' || end_ms from public.lyric_lines where project_id = v_project and line_index = 0) = '100-900', 'line bounds derived from words';
  assert (select text from public.lyric_words where id = '20000000-0000-0000-0000-000000000001') = 'שלום', 'text trimmed';
  assert (select string_agg(word_index::text, ',' order by word_index) from public.lyric_words where project_id = v_project) = '0,1,2';

  -- stale version (another tab saved meanwhile) is rejected
  begin
    perform public.save_lyrics(v_project, v_version, '[]');
    assert false, 'stale version accepted';
  exception when raise_exception then
    assert sqlerrm = 'version_conflict', sqlerrm;
  end;

  -- invalid documents are rejected and leave data untouched
  begin
    perform public.save_lyrics(v_project, v_new, '[{"words":[{"text":"a","start_ms":500,"end_ms":100}]}]');
    assert false, 'end before start accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_lyrics(v_project, v_new, '[{"words":[{"text":"a","start_ms":500,"end_ms":600},{"text":"b","start_ms":100,"end_ms":200}]}]');
    assert false, 'unordered words accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_lyrics(v_project, v_new, '[{"words":[{"text":"   ","start_ms":1,"end_ms":2}]}]');
    assert false, 'empty word accepted';
  exception when invalid_parameter_value then null;
  end;
  assert (select count(*) from public.lyric_words where project_id = v_project) = 3, 'failed saves roll back';

  -- Bob cannot save Alice's lyrics
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  begin
    perform public.save_lyrics(v_project, v_new, '[]');
    assert false, 'bob saved alice lyrics';
  exception when no_data_found then null;
  end;
  reset role;
  -- a new AI result bumps the version so an open editor cannot overwrite it
  update public.projects set status = 'processing' where id = v_project;
  update public.projects set status = 'ready' where id = v_project;
  assert (select lyrics_version from public.projects where id = v_project) = v_new + 1, 'ready bumps version';
end $$;

\echo 'ALL SQL TESTS PASSED'
