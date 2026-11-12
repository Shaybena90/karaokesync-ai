-- Worker status and remote pause.
\set ON_ERROR_STOP on
set client_min_messages = warning;

do $$ begin
  assert public.worker_checkin('pc-1', 'v1', 'GPU (RTX)', 'idle') = false, 'not paused by default';
  assert public.worker_checkin('pc-1', 'v1', 'GPU (RTX)', 'processing') = false;
  assert (select count(*) from public.workers) = 1, 'a check-in updates, not duplicates';
  assert (select activity from public.workers where id = 'pc-1') = 'processing';
  update public.worker_control set paused = true;
  assert public.worker_checkin('pc-1', 'v1', 'GPU (RTX)', 'idle') = true, 'pause reaches the worker';
  update public.workers set last_seen = now() - interval '8 days' where id = 'pc-1';
  perform public.worker_checkin('pc-2', 'v1', 'CPU', 'idle');
  assert not exists (select 1 from public.workers where id = 'pc-1'), 'long-gone workers are forgotten';
  begin
    insert into public.worker_control (id) values (2);
    assert false, 'a second control row';
  exception when check_violation then null;
  end;
end $$;

\ir ../migrations/20261114000001_worker_control.sql

set role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  begin
    perform 1 from public.workers;
    assert false, 'browser read the workers';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.worker_control set paused = false;
    assert false, 'browser changed the pause';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.worker_checkin('evil', 'x', 'x', 'x');
    assert false, 'browser checked in as a worker';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo 'WORKER CONTROL TESTS PASSED'
