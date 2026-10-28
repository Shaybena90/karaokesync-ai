"""Word alignment strategy per language.

WhisperX-style CTC forced alignment needs a wav2vec2/MMS model trained on the
specific language, and support differs a lot between languages (Hebrew, for
example, is not among WhisperX's built-in default align models). Rather than
assuming every language is supported equally, each language is mapped to an
explicit method here.

Currently implemented:
  * "whisper_dtw" — word timings from faster-whisper's cross-attention DTW.
    Works for every language Whisper transcribes, including Hebrew.

Planned (development stage 5): a CTC forced aligner (torchaudio MMS_FA, which
covers 1,100+ languages incl. Hebrew via romanisation) that refines the
timings produced here, and alignment of user-supplied lyrics.
"""

from __future__ import annotations

from .lines import Word

ALIGNMENT_METHODS: dict[str, str] = {}
DEFAULT_METHOD = "whisper_dtw"


def method_for(language: str) -> str:
    return ALIGNMENT_METHODS.get(language, DEFAULT_METHOD)


def align(words: list[Word], language: str) -> tuple[list[Word], str]:
    method = method_for(language)
    if method == "whisper_dtw":
        return words, method
    raise NotImplementedError(method)  # pragma: no cover
