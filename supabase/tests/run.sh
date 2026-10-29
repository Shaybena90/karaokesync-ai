#!/usr/bin/env bash
# Runs the migration + tests on a throw-away local PostgreSQL (developer tool).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
data="$(mktemp -d)"
trap '"$PGBIN/pg_ctl" -D "$data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$data"' EXIT
"$PGBIN/initdb" -D "$data" -U postgres >/dev/null
"$PGBIN/pg_ctl" -D "$data" -o "-p 54329 -k $data -c listen_addresses=''" -l "$data/log" start >/dev/null
psql=(psql -h "$data" -p 54329 -U postgres -v ON_ERROR_STOP=1 -q)
"${psql[@]}" -c 'create database t'
"${psql[@]}" -d t -f "$here/00_stub_supabase.sql"
for migration in "$here"/../migrations/*.sql; do
  "${psql[@]}" -d t -f "$migration"
done
for test in "$here"/[1-9]*_test.sql; do
  "${psql[@]}" -d t -f "$test"
done
