-- Export queue behaviour.
\set ON_ERROR_STOP on
set client_min_messages = warning;

do $$
declare
  v_project uuid; v_job public.export_jobs; v_other public.export_jobs;
begin
  select id into v_project from public.projects limit 1;
  insert into public.export_jobs (project_id, user_id, format, options)
    values (v_project, '00000000-0000-0000-0000-00000000000a', 'mp4', '{"aspect":"9:16"}');

  begin
    insert into public.export_jobs (project_id, user_id, format)
      values (v_project, '00000000-0000-0000-0000-00000000000a', 'mp4');
    assert false, 'second active export allowed';
  exception when unique_violation then null;
  end;

  select * into v_job from public.claim_export_job('w1', 60);
  assert v_job.id is not null and v_job.status = 'running' and v_job.attempts = 1;
  select * into v_other from public.claim_export_job('w2', 60);
  assert v_other.id is null, 'export claimed twice';
  assert public.heartbeat_export_job(v_job.id, 'w1', 60, 40);
  assert not public.heartbeat_export_job(v_job.id, 'w2', 60, 40);

  -- retryable failure → back to queue
  perform public.fail_export_job(v_job.id, 'w1', 'render_failed', true, 0);
  select * into v_job from public.export_jobs where id = v_job.id;
  assert v_job.status = 'queued';
  select * into v_job from public.claim_export_job('w3', 60);
  assert v_job.attempts = 2;
  assert not public.complete_export_job(v_job.id, 'w1', 'x'), 'stale worker completed';
  assert public.complete_export_job(v_job.id, 'w3', 'a/p/e.mp4');
  select * into v_job from public.export_jobs where id = v_job.id;
  assert v_job.status = 'succeeded' and v_job.output_path = 'a/p/e.mp4' and v_job.progress = 100;
end $$;

-- users can read only their own exports, and cannot call queue functions
set role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
  assert (select count(*) from public.export_jobs) = 0, 'bob sees alice exports';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  assert (select count(*) from public.export_jobs) = 1;
  begin
    perform public.claim_export_job('evil', 60);
    assert false;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.export_jobs (project_id, user_id, format) select id, auth.uid(), 'mp4' from public.projects;
    assert false, 'browser created an export directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo 'EXPORT QUEUE TESTS PASSED'
