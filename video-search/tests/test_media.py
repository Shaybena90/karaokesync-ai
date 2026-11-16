from pathlib import Path

import pytest

from vsearch.media import DecodeReport, MediaError, export_clip, iter_frames, probe, sha256_file
from conftest import ffprobe_pts


def test_probe_cfr(cfr_video):
    p = probe(cfr_video)
    assert (p["width"], p["height"]) == (320, 240)
    assert abs(p["duration"] - 4.0) < 0.1
    assert p["variable_frame_rate"] is False
    assert p["decoded_sample_frames"] > 0


def test_vfr_timestamps_come_from_pts_not_index(vfr_video):
    p = probe(vfr_video)
    assert p["variable_frame_rate"] is True
    times = [t for t, _ in iter_frames(vfr_video)]
    ref = ffprobe_pts(vfr_video)
    ref = [r - ref[0] for r in ref]
    assert len(times) == len(ref) == 100
    assert max(abs(a - b) for a, b in zip(times, ref)) < 1e-3
    # frame 50 is at 3.0 s; index/fps would have said 2.0 s
    assert abs(times[50] - 3.0) < 1e-3


def test_range_and_report(cfr_video):
    rep = DecodeReport()
    times = [t for t, _ in iter_frames(cfr_video, 1.0, 2.0, rep)]
    assert abs(times[0] - 1.0) < 1e-6 and abs(times[-1] - 2.0) < 1e-6
    assert rep.frames_decoded == len(times) == 26
    assert rep.errors == []


def test_undecodable_file(tmp_path):
    bad = tmp_path / "bad.mp4"
    bad.write_bytes(b"this is not a video" * 100)
    with pytest.raises(MediaError):
        probe(bad)
    with pytest.raises(MediaError):
        probe(tmp_path / "missing.mp4")


def test_sha_and_clip_leave_source_untouched(cfr_video, tmp_path):
    before = sha256_file(cfr_video)
    out = export_clip(cfr_video, tmp_path / "c.mp4", 1.0, 2.0)
    assert out.is_file() and abs(probe(out)["duration"] - 1.0) < 0.15
    assert sha256_file(cfr_video) == before


def test_seek_in_mpegts_does_not_skip_frames(media_dir, cfr_video):
    from conftest import ffmpeg
    ts = media_dir / "x.ts"
    ffmpeg("-i", str(cfr_video), "-c:v", "mpeg2video", "-q:v", "3", str(ts))
    all_t = [t for t, _ in iter_frames(ts)]
    for s in (0.5, 1.0, 2.36, 3.0):
        got = [t for t, _ in iter_frames(ts, s, s + 0.5)]
        ref = [t for t in all_t if s - 1e-6 <= t <= s + 0.5 + 1e-6]
        assert got == pytest.approx(ref), s
