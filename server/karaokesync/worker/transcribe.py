"""Speech recognition with word-level timestamps (faster-whisper).

faster-whisper produces word timings by aligning Whisper's cross-attention to
the audio (dynamic time warping). These timings are real measurements, but are
less precise than a dedicated CTC forced aligner; the alignment step is kept
separate (see alignment.py) so that a stronger, language-specific aligner can
replace it for languages where one is available.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from pathlib import Path

from .errors import PipelineError
from .lines import Word

log = logging.getLogger("karaokesync.transcribe")

_model = None
_model_key: tuple | None = None
_model_lock = threading.Lock()


@dataclass
class Transcript:
    language: str
    language_probability: float
    words: list[Word]


def _resolve_device(device: str) -> str:
    if device != "auto":
        return device
    try:
        import ctranslate2

        return "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    except Exception:  # pragma: no cover - depends on the machine
        return "cpu"


def _load_model(name: str, device: str, compute_type: str):
    global _model, _model_key
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise PipelineError("ai_dependencies_missing", retryable=False) from exc

    device = _resolve_device(device)
    if compute_type == "auto":
        compute_type = "float16" if device == "cuda" else "int8"
    key = (name, device, compute_type)
    with _model_lock:
        if _model is None or _model_key != key:
            log.info("loading whisper model=%s device=%s compute=%s", name, device, compute_type)
            _model = WhisperModel(name, device=device, compute_type=compute_type)
            _model_key = key
    return _model


def load_wav_16k(path: Path):
    """Read the 16 kHz mono PCM file made by to_working_wav as float32 samples.

    Passing samples (instead of a path) keeps faster-whisper from decoding the
    file again with PyAV, whose API changes between versions broke decoding.
    """
    import wave

    import numpy as np

    with wave.open(str(path), "rb") as wav:
        if wav.getframerate() != 16000 or wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise PipelineError("convert_failed", retryable=False)
        frames = wav.readframes(wav.getnframes())
    return np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0


def transcribe(
    audio: Path,
    model_name: str,
    device: str,
    compute_type: str,
    language: str | None = None,
    on_progress=None,
) -> Transcript:
    model = _load_model(model_name, device, compute_type)
    segments, info = model.transcribe(
        load_wav_16k(audio),
        language=language,
        word_timestamps=True,
        vad_filter=True,
        beam_size=5,
        condition_on_previous_text=False,  # reduces hallucinated repetition on music
    )
    words: list[Word] = []
    duration = max(float(info.duration or 0), 1.0)
    for seg_index, segment in enumerate(segments):  # generator: decoding happens here
        # Whisper may "hallucinate" text over instrumental parts; such segments
        # have a high no-speech probability and are dropped instead of shown.
        if segment.no_speech_prob > 0.8 and segment.avg_logprob < -1.0:
            continue
        for w in segment.words or []:
            words.append(
                Word(
                    text=w.word,
                    start_ms=int(round(w.start * 1000)),
                    end_ms=int(round(w.end * 1000)),
                    confidence=float(w.probability),
                    segment_index=seg_index,
                )
            )
        if on_progress:
            on_progress(min(1.0, segment.end / duration))
    return Transcript(language=info.language, language_probability=float(info.language_probability), words=words)
