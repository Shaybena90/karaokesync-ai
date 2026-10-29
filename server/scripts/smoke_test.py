"""Post-deployment smoke test: checks a live KaraokeSync AI deployment from the outside.

Usage (from the server folder):
    .venv\\Scripts\\python scripts\\smoke_test.py --web https://your-site.vercel.app --api https://your-api.onrender.com

Supabase URL / anon key / service key are read from the root .env (or given
with --supabase-url / --anon-key). The service key is only used to make sure
it does NOT appear in the website's JavaScript; it is never sent anywhere.
Exit code 0 = all checks passed.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]


@dataclass
class Report:
    results: list[tuple[bool, str, str]] = field(default_factory=list)

    def check(self, ok: bool, name: str, detail: str = "") -> bool:
        self.results.append((bool(ok), name, detail))
        return bool(ok)

    @property
    def ok(self) -> bool:
        return all(r[0] for r in self.results)

    def print(self) -> None:
        for ok, name, detail in self.results:
            print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail and not ok else ""))
        failed = sum(1 for r in self.results if not r[0])
        print(f"\n{len(self.results) - failed}/{len(self.results)} checks passed")


def check_website(client: httpx.Client, web: str, api: str, supabase_url: str, secrets: list[str], r: Report) -> None:
    try:
        home = client.get(web + "/")
    except httpx.HTTPError as exc:
        r.check(False, "website reachable", type(exc).__name__)
        return
    r.check(home.status_code == 200 and "KaraokeSync" in home.text, "website reachable", f"HTTP {home.status_code}")
    r.check(home.headers.get("x-content-type-options") == "nosniff", "website security headers (vercel.json)")
    deep = client.get(web + "/projects")
    r.check(deep.status_code == 200 and "<div id=\"root\">" in deep.text, "deep links work (SPA rewrite)", f"HTTP {deep.status_code}")
    manifest = client.get(web + "/manifest.webmanifest")
    r.check(manifest.status_code == 200 and "KaraokeSync" in manifest.text, "PWA manifest", f"HTTP {manifest.status_code}")

    scripts = re.findall(r'src="(/assets/[^"]+\.js)"', home.text)
    bundle = "".join(client.get(web + s).text for s in scripts)
    if not r.check(bool(bundle), "website JavaScript downloadable"):
        return
    r.check(api in bundle, "website points to this API (VITE_API_URL)", "VITE_API_URL in Vercel differs from --api")
    r.check(supabase_url in bundle, "website points to this Supabase (VITE_SUPABASE_URL)")
    leaked = [s for s in secrets if s and len(s) > 20 and s in bundle]
    r.check(not leaked, "no secret key in the website's JavaScript", "SERVICE ROLE KEY IS PUBLIC — rotate it now!")


def check_api(client: httpx.Client, web: str, api: str, r: Report) -> None:
    try:
        health = client.get(api + "/health")
    except httpx.HTTPError as exc:
        r.check(False, "API reachable", type(exc).__name__)
        return
    r.check(health.status_code == 200 and health.json().get("ok") is True, "API reachable", f"HTTP {health.status_code}")
    r.check(client.get(api + "/limits").status_code == 200, "API /limits")
    r.check(client.get(api + "/docs").status_code == 404, "API docs hidden in production (APP_ENV=production)")
    pre = client.options(api + "/uploads", headers={"Origin": web, "Access-Control-Request-Method": "POST",
                                                     "Access-Control-Request-Headers": "authorization,content-type"})
    r.check(pre.headers.get("access-control-allow-origin") == web, "API accepts the website (CORS_ORIGINS)",
            f"got {pre.headers.get('access-control-allow-origin')!r}")
    evil = client.options(api + "/uploads", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    r.check("access-control-allow-origin" not in evil.headers, "API rejects other websites (CORS)")
    unauth = client.post(api + "/uploads", json={"file_name": "a.mp3", "size_bytes": 1})
    r.check(unauth.status_code == 401, "API requires sign-in", f"HTTP {unauth.status_code}")


def check_supabase(client: httpx.Client, supabase_url: str, anon_key: str, google_enabled: bool, r: Report) -> None:
    h = {"apikey": anon_key, "Authorization": f"Bearer {anon_key}"}
    try:
        rows = client.get(f"{supabase_url}/rest/v1/projects?select=id&limit=1", headers=h)
    except httpx.HTTPError as exc:
        r.check(False, "Supabase reachable", type(exc).__name__)
        return
    r.check(rows.status_code in (200, 401, 403) and (rows.status_code != 200 or rows.json() == []),
            "database rows hidden from anonymous visitors (RLS)", f"HTTP {rows.status_code}")
    missing = rows.status_code == 404 or (rows.status_code >= 400 and "does not exist" in rows.text)
    r.check(not missing, "database tables exist (migrations were run)")
    rpc = client.post(f"{supabase_url}/rest/v1/rpc/claim_processing_job", headers=h, json={"p_worker_id": "smoke", "p_lease_seconds": 1})
    r.check(rpc.status_code in (401, 403, 404), "queue functions not callable from the browser", f"HTTP {rpc.status_code}")
    export_fn = client.post(f"{supabase_url}/rest/v1/rpc/claim_export_job", headers=h, json={"p_worker_id": "smoke", "p_lease_seconds": 1})
    r.check(export_fn.status_code in (401, 403, 404), "export queue not callable from the browser", f"HTTP {export_fn.status_code}")
    save = client.post(f"{supabase_url}/rest/v1/rpc/save_lyrics", headers=h, json={})
    r.check(save.status_code != 404 or "save_lyrics" not in save.text, "editor migration was run (save_lyrics exists)")
    for bucket in ("audio", "exports"):
        public = client.get(f"{supabase_url}/storage/v1/object/public/{bucket}/smoke-test.txt")
        r.check(public.status_code != 200, f"storage bucket '{bucket}' is private")
        listing = client.post(f"{supabase_url}/storage/v1/object/list/{bucket}", headers=h, json={"prefix": ""})
        r.check(listing.status_code != 200 or listing.json() == [], f"bucket '{bucket}' not listable anonymously")
    settings = client.get(f"{supabase_url}/auth/v1/settings", headers=h)
    if r.check(settings.status_code == 200, "Supabase Auth reachable", f"HTTP {settings.status_code}"):
        s = settings.json()
        r.check(s.get("external", {}).get("email") is True, "email sign-in enabled")
        r.check(s.get("disable_signup") is not True, "new users can sign up")
        r.check(s.get("mailer_autoconfirm") is not True, "email confirmation required (Auth > Providers > Email)")
        if google_enabled:
            r.check(s.get("external", {}).get("google") is True, "Google sign-in enabled in Supabase (VITE_ENABLE_GOOGLE_AUTH=true)")


def main(argv: list[str] | None = None, client: httpx.Client | None = None) -> int:
    env = {**dotenv_values(ROOT / ".env"), **os.environ}
    p = argparse.ArgumentParser(description="Smoke-test a live KaraokeSync AI deployment")
    p.add_argument("--web", required=True, help="website address, e.g. https://karaoke.vercel.app")
    p.add_argument("--api", required=True, help="API address, e.g. https://karaoke-api.onrender.com")
    p.add_argument("--supabase-url", default=env.get("VITE_SUPABASE_URL") or env.get("SUPABASE_URL"))
    p.add_argument("--anon-key", default=env.get("VITE_SUPABASE_ANON_KEY"))
    p.add_argument("--google", action="store_true", default=str(env.get("VITE_ENABLE_GOOGLE_AUTH")).lower() == "true")
    args = p.parse_args(argv)
    if not args.supabase_url or not args.anon_key:
        print("Supabase URL / anon key missing: fill in .env or pass --supabase-url and --anon-key")
        return 2
    web, api, sb = args.web.rstrip("/"), args.api.rstrip("/"), args.supabase_url.rstrip("/")

    r = Report()
    # The free API host sleeps when idle; the first request may take up to a minute.
    http = client or httpx.Client(timeout=httpx.Timeout(90.0, connect=30.0), follow_redirects=True)
    with http:
        check_api(http, web, api, r)
        check_website(http, web, api, sb, [str(env.get("SUPABASE_SERVICE_ROLE_KEY") or "")], r)
        check_supabase(http, sb, args.anon_key, args.google, r)
    r.print()
    return 0 if r.ok else 1


if __name__ == "__main__":
    sys.exit(main())
