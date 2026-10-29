"""Minimal server-side Supabase client (PostgREST, Storage, Auth) over httpx.

Uses the service role key, which bypasses RLS — every caller is responsible
for checking that the authenticated user owns the rows it touches.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

from .config import Settings


class SupabaseError(Exception):
    def __init__(self, status_code: int, message: str, code: str | None = None):
        super().__init__(f"{status_code}: {message}")
        self.status_code = status_code
        self.code = code


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None


class SupabaseClient:
    def __init__(self, settings: Settings, http: httpx.Client | None = None):
        settings.require_supabase()
        self._url = settings.supabase_url.rstrip("/")
        self._key = settings.supabase_service_role_key
        self._http = http or httpx.Client(timeout=httpx.Timeout(30.0, connect=10.0))

    # ------------------------------------------------------------------ utils
    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {"apikey": self._key, "Authorization": f"Bearer {self._key}"}
        if extra:
            headers.update(extra)
        return headers

    @staticmethod
    def _raise_for(resp: httpx.Response) -> None:
        if resp.is_success:
            return
        code = None
        message = resp.reason_phrase
        try:
            body = resp.json()
            code = body.get("code") or body.get("error")
            message = body.get("message") or body.get("msg") or message
        except ValueError:
            pass
        raise SupabaseError(resp.status_code, str(message), str(code) if code else None)

    # ------------------------------------------------------------------- auth
    def get_user(self, access_token: str) -> AuthUser | None:
        """Validate a user's access token with Supabase Auth. Returns None if invalid."""
        resp = self._http.get(
            f"{self._url}/auth/v1/user",
            headers={"apikey": self._key, "Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code in (401, 403):
            return None
        self._raise_for(resp)
        data = resp.json()
        return AuthUser(id=data["id"], email=data.get("email"))

    # --------------------------------------------------------------- postgrest
    def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        resp = self._http.get(f"{self._url}/rest/v1/{table}", params=params, headers=self._headers())
        self._raise_for(resp)
        return resp.json()

    def count(self, table: str, params: dict[str, str]) -> int:
        resp = self._http.head(
            f"{self._url}/rest/v1/{table}",
            params={**params, "select": "id"},
            headers=self._headers({"Prefer": "count=exact"}),
        )
        self._raise_for(resp)
        content_range = resp.headers.get("content-range", "*/0")
        return int(content_range.split("/")[-1])

    def insert(self, table: str, row: dict[str, Any]) -> dict[str, Any]:
        resp = self._http.post(
            f"{self._url}/rest/v1/{table}",
            json=row,
            headers=self._headers({"Prefer": "return=representation"}),
        )
        self._raise_for(resp)
        return resp.json()[0]

    def update(self, table: str, params: dict[str, str], values: dict[str, Any]) -> list[dict[str, Any]]:
        resp = self._http.patch(
            f"{self._url}/rest/v1/{table}",
            params=params,
            json=values,
            headers=self._headers({"Prefer": "return=representation"}),
        )
        self._raise_for(resp)
        return resp.json()

    def delete(self, table: str, params: dict[str, str]) -> None:
        resp = self._http.delete(f"{self._url}/rest/v1/{table}", params=params, headers=self._headers())
        self._raise_for(resp)

    def rpc(self, fn: str, args: dict[str, Any]) -> Any:
        resp = self._http.post(f"{self._url}/rest/v1/rpc/{fn}", json=args, headers=self._headers())
        self._raise_for(resp)
        return resp.json() if resp.content else None

    # ----------------------------------------------------------------- storage
    def create_signed_upload_url(self, bucket: str, path: str) -> str:
        """One-time upload URL for a single, not-yet-existing object (no upsert)."""
        resp = self._http.post(
            f"{self._url}/storage/v1/object/upload/sign/{bucket}/{quote(path)}",
            headers=self._headers(),
        )
        self._raise_for(resp)
        return f"{self._url}/storage/v1{resp.json()['url']}"

    def create_signed_url(self, bucket: str, path: str, expires_in: int) -> str:
        resp = self._http.post(
            f"{self._url}/storage/v1/object/sign/{bucket}/{quote(path)}",
            json={"expiresIn": expires_in},
            headers=self._headers(),
        )
        self._raise_for(resp)
        signed = resp.json().get("signedURL") or resp.json().get("signedUrl")
        return f"{self._url}/storage/v1{signed}"

    def upload_file(self, bucket: str, path: str, local_path: str, content_type: str) -> None:
        """Upload (or replace) an object from a local file."""
        with open(local_path, "rb") as fh:
            resp = self._http.post(
                f"{self._url}/storage/v1/object/{bucket}/{quote(path)}",
                content=fh,
                headers=self._headers({"Content-Type": content_type, "x-upsert": "true"}),
                timeout=httpx.Timeout(600.0, connect=10.0),
            )
        self._raise_for(resp)

    def list_objects(self, bucket: str, prefix: str) -> list[str]:
        resp = self._http.post(
            f"{self._url}/storage/v1/object/list/{bucket}",
            json={"prefix": prefix, "limit": 1000},
            headers=self._headers(),
        )
        self._raise_for(resp)
        return [f"{prefix.rstrip('/')}/{o['name']}" for o in resp.json() if o.get("id")]

    def remove_objects(self, bucket: str, paths: list[str]) -> None:
        if not paths:
            return
        resp = self._http.request(
            "DELETE",
            f"{self._url}/storage/v1/object/{bucket}",
            json={"prefixes": paths},
            headers=self._headers(),
        )
        self._raise_for(resp)

    def read_range(self, url: str, length: int) -> tuple[bytes, int | None]:
        """Read the first `length` bytes of a (signed) URL.

        Returns the bytes and the object's total size (from Content-Range) if known.
        """
        with self._http.stream("GET", url, headers={"Range": f"bytes=0-{length - 1}"}) as resp:
            if not resp.is_success:
                resp.read()
                self._raise_for(resp)
            total: int | None = None
            content_range = resp.headers.get("content-range", "")
            if "/" in content_range and content_range.rsplit("/", 1)[1].isdigit():
                total = int(content_range.rsplit("/", 1)[1])
            elif resp.status_code == 200 and resp.headers.get("content-length", "").isdigit():
                total = int(resp.headers["content-length"])
            data = b""
            for chunk in resp.iter_bytes():
                data += chunk
                if len(data) >= length:
                    break
            return data[:length], total

    def download_to(self, url: str, dest: str, max_bytes: int) -> int:
        """Stream a (signed) URL to disk, refusing anything larger than max_bytes."""
        written = 0
        with self._http.stream("GET", url, timeout=httpx.Timeout(300.0, connect=10.0)) as resp:
            if not resp.is_success:
                resp.read()
                self._raise_for(resp)
            with open(dest, "wb") as fh:
                for chunk in resp.iter_bytes(1024 * 256):
                    written += len(chunk)
                    if written > max_bytes:
                        raise SupabaseError(413, "downloaded file exceeds size limit")
                    fh.write(chunk)
        return written
