-- Sync queue behaviour.
\set ON_ERROR_STOP on
set client_min_messages = warning;

do $$
declare
  v_project uuid; v_job public.sync_jobs; v_other public.sync_jobs;
begin
  select id into v_project from public.projects limit 1;

  begin
    insert into public.sync_jobs (project_id, user_id, words, window_start_ms, window_end_ms)
      values (v_project, '00000000-0000-0000-0000-00000000000a', '["a"]', 0, 90000);
    assert false, 'window longer than 60 s allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.sync_jobs (project_id, user_id, words, window_start_ms, window_end_ms)
      values (v_project, '00000000-0000-0000-0000-00000000000a', '[]', 0, 1000);
    assert false, 'empty word list allowed';
  exception when check_violation then null;
  end;

  insert into public.sync_jobs (project_id, user_id, words, window_start_ms, window_end_ms, language)
    values (v_project, '00000000-0000-0000-0000-00000000000a', '["שלום","עולם"]', 1000, 5000, 'he');

  select * into v_job from public.claim_sync_job('w1', 60);
  assert v_job.id is not null and v_job.status = 'running' and v_job.attempts = 1;
  select * into v_other from public.claim_sync_job('w2', 60);
  assert v_other.id is null, 'sync job claimed twice';
  assert public.heartbeat_sync_job(v_job.id, 'w1', 60, 50);
  assert not public.heartbeat_sync_job(v_job.id, 'w2', 60, 50);

  -- retryable failure → back to the queue
  perform public.fail_sync_job(v_job.id, 'w1', 'download_failed', true, 0);
  select * into v_job from public.sync_jobs where id = v_job.id;
  assert v_job.status = 'queued';
  select * into v_job from public.claim_sync_job('w3', 60);
  assert v_job.attempts = 2;

  assert not public.complete_sync_job(v_job.id, 'w1', '[{},{}]'), 'stale worker completed';
  assert not public.complete_sync_job(v_job.id, 'w3', '[{}]'), 'result with the wrong word count accepted';
  assert public.complete_sync_job(v_job.id, 'w3',
    '[{"start_ms":1200,"end_ms":1600,"confidence":0.9},{"start_ms":1700,"end_ms":2100,"confidence":0.8}]');
  select * into v_job from public.sync_jobs where id = v_job.id;
  assert v_job.status = 'succeeded' and jsonb_array_length(v_job.result) = 2 and v_job.finished_at is not null;
end $$;

-- the migration can be run again without errors
\ir ../migrations/20261102000001_sync_jobs.sql

-- users can read only their own sync jobs, and cannot call queue functions
set role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  assert (select count(*) from public.sync_jobs) = 0, 'bob sees alice sync jobs';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  assert (select count(*) from public.sync_jobs) = 1;
  begin
    perform public.claim_sync_job('evil', 60);
    assert false;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.sync_jobs (project_id, user_id, words, window_start_ms, window_end_ms)
      select id, auth.uid(), '["x"]', 0, 1000 from public.projects;
    assert false, 'browser created a sync job directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo 'SYNC QUEUE TESTS PASSED'
