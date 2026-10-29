import pytest

from karaokesync.worker.audio_tools import to_working_wav
from karaokesync.worker.errors import PipelineError
from karaokesync.worker.transcribe import load_wav_16k

from .conftest import make_audio, needs_ffmpeg

np = pytest.importorskip("numpy")


@needs_ffmpeg
def test_load_wav_16k_reads_converted_audio(tmp_path):
    wav = to_working_wav(make_audio(tmp_path, "mp3", seconds=1.0), tmp_path / "work.wav")
    samples = load_wav_16k(wav)
    assert samples.dtype == np.float32
    assert 15000 < len(samples) < 17500  # ~1 s at 16 kHz
    assert 0.1 < float(np.abs(samples).max()) <= 1.0


@needs_ffmpeg
def test_load_wav_16k_rejects_other_formats(tmp_path):
    with pytest.raises(PipelineError):
        load_wav_16k(make_audio(tmp_path, "wav"))  # 44.1 kHz, not the working format
