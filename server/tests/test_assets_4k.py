"""4K files from the assets-4k branch: downloaded once, used only when they match the list."""

import hashlib

import httpx
import pytest

from karaokesync import animated_backgrounds as ab
from karaokesync import assets_4k
from karaokesync.exports.video import best_resolution
from karaokesync.worker.errors import PipelineError

DATA = b"4k video bytes" * 1000


@pytest.fixture
def listed(monkeypatch):
    entry = {"bytes": len(DATA), "sha256": hashlib.sha256(DATA).hexdigest()}
    table = {"backgrounds/aurora-night-2160.mp4": entry, "backgrounds/aurora-night-1080.mp4": entry}
    monkeypatch.setattr(assets_4k, "manifest", lambda: table)
    return table


def client(body: bytes, status: int = 200, calls: list | None = None) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(str(request.url))
        return httpx.Response(status, content=body)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_downloaded_once_then_reused(tmp_path, listed):
    calls = []
    path = assets_4k.fetch("backgrounds/aurora-night-2160.mp4", tmp_path, "https://example.test/a/", client(DATA, calls=calls))
    assert path.read_bytes() == DATA and calls == ["https://example.test/a/backgrounds/aurora-night-2160.mp4"]
    again = assets_4k.fetch("backgrounds/aurora-night-2160.mp4", tmp_path, "https://example.test/a/", client(b"", 500, calls))
    assert again == path and len(calls) == 1


@pytest.mark.parametrize("body", [DATA[:-1] + b"X", DATA + b"more", DATA[:100]])
def test_a_file_that_does_not_match_is_never_used(tmp_path, listed, body):
    with pytest.raises(PipelineError) as err:
        assets_4k.fetch("backgrounds/aurora-night-2160.mp4", tmp_path, "https://example.test/", client(body))
    assert err.value.code == "asset_download_failed" and not err.value.retryable
    assert not list(tmp_path.rglob("*.mp4*"))   # nothing half-downloaded is left


def test_server_errors_can_be_retried_and_unknown_files_are_refused(tmp_path, listed):
    with pytest.raises(PipelineError) as err:
        assets_4k.fetch("backgrounds/aurora-night-2160.mp4", tmp_path, "https://example.test/", client(b"", 503))
    assert err.value.retryable
    with pytest.raises(PipelineError) as err:
        assets_4k.fetch("../../etc/passwd", tmp_path, "https://example.test/", client(DATA))
    assert err.value.code == "asset_missing"


def test_a_4k_background_comes_at_the_size_of_the_video(tmp_path, listed, monkeypatch):
    asked = []
    monkeypatch.setattr(assets_4k, "fetch", lambda name, cache, url: asked.append(name) or tmp_path / name)
    ab.clip_for("aurora-night", tmp_path, resolution=2160)
    ab.clip_for("aurora-night", tmp_path, resolution=1080)
    ab.clip_for("aurora-night", tmp_path, resolution=480)
    assert asked == ["backgrounds/aurora-night-2160.mp4", "backgrounds/aurora-night-1080.mp4", "backgrounds/aurora-night-1080.mp4"]


def test_every_4k_background_has_its_preview_and_is_listed():
    for bg in ab.BACKGROUNDS.values():
        if bg.uhd:
            assert (ab.PREBUILT_DIR / f"{bg.id}.mp4").is_file() and (ab.PREBUILT_DIR / f"{bg.id}.jpg").is_file()
            for size in (2160, 1080):
                assert assets_4k.has(f"backgrounds/{bg.id}-{size}.mp4"), (bg.id, size)


def test_4k_falls_back_to_1080p_when_the_size_limit_would_starve_it():
    mb = 1024 * 1024
    assert best_resolution(2160, 4 * 60_000, 600 * mb) == 2160
    assert best_resolution(2160, 12 * 60_000, 600 * mb) == 1080


def test_4k_title_designs_have_their_backdrops_listed_and_fetched(tmp_path, monkeypatch):
    from karaokesync.exports import opening as op

    uhd = [t for t in op.THEMES.values() if t.uhd]
    assert len(uhd) == 20
    for t in uhd:
        assert (op.INTRO_DIR / t.backdrop).is_file()   # the website's light preview
        for size in (2160, 1080):
            assert assets_4k.has(f"intro/title-{t.id}-{size}.mp4"), (t.id, size)
    asked = []
    monkeypatch.setattr(assets_4k, "fetch", lambda name, cache, url: asked.append(name) or tmp_path / name)
    op.backdrop_file(op.THEMES["velvet"], 2160, tmp_path)
    op.backdrop_file(op.THEMES["velvet"], 1080, tmp_path)
    assert asked == ["intro/title-velvet-2160.mp4", "intro/title-velvet-1080.mp4"]
    assert op.backdrop_file(op.THEMES["gold"], 2160, tmp_path) == op.INTRO_DIR / "title-gold.mp4"   # older designs stay local
    assert op.opening_files(op.OpeningOptions(title=op.TitleCard(song="שיר"), title_theme="velvet"), "16:9") == []
