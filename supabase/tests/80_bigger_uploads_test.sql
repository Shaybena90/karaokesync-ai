\set ON_ERROR_STOP on
do $$ begin
  assert (select file_size_limit from storage.buckets where id = 'backgrounds') = 209715200, 'backgrounds bucket allows 200 MB';
end $$;
\ir ../migrations/20261116000001_bigger_uploads.sql
\echo 'BIGGER UPLOADS TESTS PASSED'
