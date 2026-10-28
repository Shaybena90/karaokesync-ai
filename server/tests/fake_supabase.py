"""In-memory stand-in for SupabaseClient, supporting the filters the app uses."""

from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone
from pathlib import Path

from karaokesync.supabase_client import AuthUser, SupabaseError


def _matches(row: dict, key: str, expr: str) -> bool:
    op, _, value = expr.partition(".")
    if op == "not":
        return not _matches(row, key, value)
    current = row.get(key)
    if op == "eq":
        return str(current) == value
    if op == "neq":
        return str(current) != value
    if op in ("gte", "lt"):
        return (str(current) >= value) if op == "gte" else (str(current) < value)
    if op == "in":
        return str(current) in value.strip("()").split(",")
    raise NotImplementedError(op)


class FakeSupabase:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {
            "projects": [], "audio_files": [], "processing_jobs": [],
        }
        self.tokens: dict[str, AuthUser] = {}
        self.objects: dict[str, dict[str, Path]] = {"audio": {}, "exports": {}}
        self.signed_upload_paths: list[str] = []

    # auth
    def add_user(self, token: str, user_id: str | None = None) -> AuthUser:
        user = AuthUser(id=user_id or str(uuid.uuid4()), email=f"{token}@example.com")
        self.tokens[token] = user
        return user

    def get_user(self, token: str):
        return self.tokens.get(token)

    # rest
    def _filter(self, table: str, params: dict) -> list[dict]:
        rows = self.tables[table]
        for key, expr in params.items():
            if key in ("select", "order", "limit"):
                continue
            rows = [r for r in rows if _matches(r, key, expr)]
        return rows

    def select(self, table, params):
        rows = self._filter(table, params)
        if "limit" in params:
            rows = rows[: int(params["limit"])]
        return copy.deepcopy(rows)

    def count(self, table, params):
        return len(self._filter(table, params))

    def insert(self, table, row):
        row = {"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat(), **row}
        if table == "projects":
            row.setdefault("status", "awaiting_upload")
            row.setdefault("error_code", None)
        if table == "audio_files":
            row.setdefault("status", "pending")
            row.setdefault("duration_ms", None)
        if table == "processing_jobs":
            row.setdefault("status", "queued")
            active = [j for j in self.tables[table]
                      if j["audio_file_id"] == row["audio_file_id"] and j["status"] in ("queued", "running")]
            if active:
                raise SupabaseError(409, "duplicate key", "23505")
        self.tables[table].append(row)
        return copy.deepcopy(row)

    def update(self, table, params, values):
        rows = self._filter(table, params)
        for r in rows:
            r.update(values)
        return copy.deepcopy(rows)

    def delete(self, table, params):
        doomed = {r["id"] for r in self._filter(table, params)}
        self.tables[table] = [r for r in self.tables[table] if r["id"] not in doomed]
        if table == "projects":  # emulate ON DELETE CASCADE
            for child in ("audio_files", "processing_jobs"):
                self.tables[child] = [r for r in self.tables[child] if r["project_id"] not in doomed]

    def rpc(self, fn, args):
        raise NotImplementedError(fn)

    # storage — objects are real files on disk so that ffprobe can read them
    def put_object(self, bucket: str, path: str, local_file: Path) -> None:
        self.objects[bucket][path] = local_file

    def create_signed_upload_url(self, bucket, path):
        self.signed_upload_paths.append(path)
        return f"https://fake.supabase.co/storage/v1/object/upload/sign/{bucket}/{path}?token=t"

    def create_signed_url(self, bucket, path, expires_in):
        if path not in self.objects[bucket]:
            raise SupabaseError(400, "Object not found")
        return str(self.objects[bucket][path])

    def read_range(self, url, length):
        data = Path(url).read_bytes()
        return data[:length], len(data)

    def list_objects(self, bucket, prefix):
        return [p for p in self.objects[bucket] if p.startswith(prefix + "/")]

    def remove_objects(self, bucket, paths):
        for p in paths:
            self.objects[bucket].pop(p, None)
