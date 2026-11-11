-- Instrumental ("melody only") queue behaviour.
\set ON_ERROR_STOP on
set client_min_messages = warning;

do $$
declare
  v_project uuid; v_audio uuid; v_job public.instrumental_jobs; v_other public.instrumental_jobs;
begin
  select project_id, id into v_project, v_audio from public.audio_files limit 1;
  insert into public.instrumental_jobs (project_id, audio_file_id, user_id)
    values (v_project, v_audio, '00000000-0000-0000-0000-00000000000a');
  begin
    insert into public.instrumental_jobs (project_id, audio_file_id, user_id)
      values (v_project, v_audio, '00000000-0000-0000-0000-00000000000a');
    assert false, 'second active instrumental job allowed';
  exception when unique_violation then null;
  end;

  select * into v_job from public.claim_instrumental_job('w1', 60);
  assert v_job.id is not null and v_job.status = 'running' and v_job.attempts = 1;
  select * into v_other from public.claim_instrumental_job('w2', 60);
  assert v_other.id is null, 'instrumental job claimed twice';
  assert public.heartbeat_instrumental_job(v_job.id, 'w1', 60, 35);
  assert (select progress from public.instrumental_jobs where id = v_job.id) = 35;
  assert not public.heartbeat_instrumental_job(v_job.id, 'w2', 60, 40);

  perform public.fail_instrumental_job(v_job.id, 'w1', 'separation_failed', true, 0);
  select * into v_job from public.instrumental_jobs where id = v_job.id;
  assert v_job.status = 'queued';
  select * into v_job from public.claim_instrumental_job('w3', 60);
  assert v_job.attempts = 2;
  assert not public.complete_instrumental_job(v_job.id, 'w1', 'x'), 'stale worker completed';
  assert public.complete_instrumental_job(v_job.id, 'w3', 'a/p/instrumental-1.mp3');
  select * into v_job from public.instrumental_jobs where id = v_job.id;
  assert v_job.status = 'succeeded' and v_job.output_path = 'a/p/instrumental-1.mp3' and v_job.progress = 100;
end $$;

-- the migration can be run again without errors
\ir ../migrations/20261112000001_instrumentals.sql

set role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  assert (select count(*) from public.instrumental_jobs) = 0, 'bob sees alice instrumentals';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  assert (select count(*) from public.instrumental_jobs) = 1;
  begin
    perform public.claim_instrumental_job('evil', 60);
    assert false;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.instrumental_jobs (project_id, audio_file_id, user_id)
      select project_id, id, auth.uid() from public.audio_files limit 1;
    assert false, 'browser created an instrumental job directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo 'INSTRUMENTAL TESTS PASSED'
