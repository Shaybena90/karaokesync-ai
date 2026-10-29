"""The post-deployment smoke test must pass a healthy deployment and catch broken ones."""

import importlib.util
import sys
from pathlib import Path

import httpx
import pytest

spec = importlib.util.spec_from_file_location("smoke_test", Path(__file__).parents[1] / "scripts" / "smoke_test.py")
smoke = importlib.util.module_from_spec(spec)
sys.modules["smoke_test"] = smoke  # dataclasses look their module up here
spec.loader.exec_module(smoke)

WEB, API, SB = "https://karaoke.example.com", "https://api.example.com", "https://abc.supabase.co"
ANON, SECRET = "anon-key-public-0123456789", "service-role-SECRET-0123456789abcdef"


def deployment(**broken):
    """A fake live deployment; keyword flags break one part of it."""

    def handler(req: httpx.Request) -> httpx.Response:
        url, origin = str(req.url), req.headers.get("origin")
        sec = {"x-content-type-options": "nosniff"}
        if url.startswith(WEB):
            path = req.url.path
            if path in ("/", "/projects"):
                return httpx.Response(200, headers=sec, text='<title>KaraokeSync AI</title><div id="root"></div><script src="/assets/index-1.js"></script>')
            if path == "/manifest.webmanifest":
                return httpx.Response(200, text='{"name":"KaraokeSync AI"}')
            if path == "/assets/index-1.js":
                body = f'const a="{broken.get("api", API)}",s="{SB}",k="{ANON}";'
                if broken.get("leak"):
                    body += f'const x="{SECRET}";'
                return httpx.Response(200, text=body)
        if url.startswith(API):
            if req.method == "OPTIONS":
                allowed = broken.get("cors", WEB)
                return httpx.Response(200, headers={"access-control-allow-origin": allowed} if origin in (allowed, "*") or allowed == "*" else {})
            return {"/health": httpx.Response(200, json={"ok": True}), "/limits": httpx.Response(200, json={}),
                    "/docs": httpx.Response(200 if broken.get("docs") else 404),
                    "/uploads": httpx.Response(401, json={"detail": "not_authenticated"})}[req.url.path]
        if url.startswith(SB):
            p = req.url.path
            if p == "/rest/v1/projects":
                return httpx.Response(200, json=[{"id": "x"}] if broken.get("rls_off") else [])
            if p.startswith("/rest/v1/rpc/"):
                return httpx.Response(200 if broken.get("rpc_open") else 401, json={})
            if p.startswith("/storage/v1/object/public/"):
                return httpx.Response(200 if broken.get("public_bucket") else 400, text="")
            if p.startswith("/storage/v1/object/list/"):
                return httpx.Response(200, json=[])
            if p == "/auth/v1/settings":
                return httpx.Response(200, json={"external": {"email": True, "google": False}, "disable_signup": False,
                                                 "mailer_autoconfirm": bool(broken.get("autoconfirm"))})
        return httpx.Response(404)

    return httpx.Client(transport=httpx.MockTransport(handler))


def run(capsys, monkeypatch, **broken):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", SECRET)
    code = smoke.main(["--web", WEB, "--api", API, "--supabase-url", SB, "--anon-key", ANON], client=deployment(**broken))
    return code, capsys.readouterr().out


def test_healthy_deployment_passes(capsys, monkeypatch):
    code, out = run(capsys, monkeypatch)
    assert code == 0, out
    assert "FAIL" not in out


@pytest.mark.parametrize("flag,expected", [
    ({"leak": True}, "no secret key in the website's JavaScript"),
    ({"cors": "*"}, "API rejects other websites"),
    ({"api": "http://localhost:8000"}, "website points to this API"),
    ({"docs": True}, "API docs hidden"),
    ({"rls_off": True}, "database rows hidden"),
    ({"rpc_open": True}, "queue functions not callable"),
    ({"public_bucket": True}, "storage bucket 'audio' is private"),
    ({"autoconfirm": True}, "email confirmation required"),
])
def test_broken_deployment_is_caught(capsys, monkeypatch, flag, expected):
    code, out = run(capsys, monkeypatch, **flag)
    assert code == 1
    assert f"FAIL  {expected}" in out
