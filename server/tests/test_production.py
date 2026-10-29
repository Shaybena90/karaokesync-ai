"""Production configuration guard and security headers."""

import pytest

from karaokesync.api.main import create_app
from karaokesync.config import get_settings


@pytest.fixture
def prod(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "supabase_url", "https://abc.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "secret")
    monkeypatch.setattr(settings, "cors_origins", "https://karaoke.example.com")
    return settings


def test_valid_production_config_starts(prod):
    assert prod.production_problems() == []
    create_app()


@pytest.mark.parametrize("field,value,needle", [
    ("cors_origins", "*", "CORS_ORIGINS"),
    ("cors_origins", "http://localhost:5173", "CORS_ORIGINS"),
    ("cors_origins", "http://karaoke.example.com", "https://"),
    ("cors_origins", "", "CORS_ORIGINS"),
    ("supabase_url", "http://abc.supabase.co", "SUPABASE_URL"),
    ("supabase_service_role_key", "", "SUPABASE_SERVICE_ROLE_KEY"),
])
def test_unsafe_production_config_refuses_to_start(prod, monkeypatch, field, value, needle):
    monkeypatch.setattr(prod, field, value)
    with pytest.raises(RuntimeError, match=needle):
        create_app()


def test_development_allows_localhost():
    assert get_settings().app_env != "production"
    create_app()  # localhost CORS is fine while developing


def test_security_headers_and_no_docs_in_production(prod):
    from fastapi.testclient import TestClient

    client = TestClient(create_app())
    resp = client.get("/health")
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"
    assert resp.headers["cache-control"] == "no-store"
    assert client.get("/docs").status_code == 404


def test_cors_only_for_the_website(prod):
    from fastapi.testclient import TestClient

    client = TestClient(create_app())
    ok = client.options("/limits", headers={"Origin": "https://karaoke.example.com", "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "https://karaoke.example.com"
    evil = client.options("/limits", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in evil.headers
