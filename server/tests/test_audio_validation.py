import pytest

from karaokesync.audio_validation import AudioValidationError, extension_of, probe, sniff_format, verify_audio

from .conftest import make_audio, needs_ffmpeg


@pytest.mark.parametrize("head,expected", [
    (b"ID3\x04\x00" + b"\x00" * 20, "mp3"),
    (b"\xff\xfb\x90\x64" + b"\x00" * 20, "mp3"),
    (b"RIFF\x24\x08\x00\x00WAVEfmt ", "wav"),
    (b"\x00\x00\x00\x20ftypM4A \x00\x00\x00\x00", "m4a"),
    (b"\x89PNG\r\n\x1a\n\x00\x00\x00\x00", None),
    (b"%PDF-1.7\n", None),
    (b"MZ\x90\x00", None),
    (b"", None),
])
def test_sniff_format(head, expected):
    assert sniff_format(head) == expected


@pytest.mark.parametrize("name,expected", [
    ("a.mp3", "mp3"), ("A.MP3", "mp3"), ("x.y.wav", "wav"), ("b.m4a", "m4a"),
    ("c.flac", None), ("noext", None), ("mp3", None),
])
def test_extension_of(name, expected):
    assert extension_of(name) == expected


@needs_ffmpeg
@pytest.mark.parametrize("ext", ["mp3", "wav", "m4a"])
def test_probe_real_files(tmp_path, ext):
    f = make_audio(tmp_path, ext, 1.5)
    result = verify_audio(f.read_bytes()[:64], str(f), max_duration_ms=10_000)
    assert result.format == ext
    assert 1400 <= result.duration_ms <= 1700


@needs_ffmpeg
def test_probe_rejects_garbage(tmp_path):
    f = tmp_path / "x.mp3"
    f.write_bytes(b"ID3" + b"\x00" * 100)
    with pytest.raises(AudioValidationError):
        probe(str(f))


@needs_ffmpeg
def test_verify_rejects_too_long(tmp_path):
    f = make_audio(tmp_path, "wav", 2)
    with pytest.raises(AudioValidationError) as err:
        verify_audio(f.read_bytes()[:64], str(f), max_duration_ms=1000)
    assert err.value.code == "too_long"
