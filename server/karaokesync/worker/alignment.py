"""Word alignment strategy per language.

WhisperX-style CTC forced alignment needs a wav2vec2/MMS model trained on the
specific language, and support differs a lot between languages (Hebrew, for
example, is not among WhisperX's built-in default align models). Rather than
assuming every language is supported equally, each language is mapped to an
explicit method here.

Currently implemented:
  * "whisper_dtw" — word timings from faster-whisper's cross-attention DTW.
    Works for every language Whisper transcribes, including Hebrew.

  * "+ctc" — then every word's start and end is refined with a CTC forced
    aligner (torchaudio MMS_FA, 1,100+ languages incl. Hebrew via
    romanisation), see ctc_refine.py. Used when it is installed.
"""

from __future__ import annotations

from .lines import Word

ALIGNMENT_METHODS: dict[str, str] = {}
DEFAULT_METHOD = "whisper_dtw"


def method_for(language: str) -> str:
    return ALIGNMENT_METHODS.get(language, DEFAULT_METHOD)


def align(words: list[Word], language: str, samples=None, refine_words: bool = False) -> tuple[list[Word], str]:
    method = method_for(language)
    if method != "whisper_dtw":
        raise NotImplementedError(method)  # pragma: no cover
    if refine_words and samples is not None and refine(words, samples):
        method += "+ctc"
    return words, method


def refine(words: list[Word], samples) -> bool:
    """Sharpen the words' times in place with the CTC aligner; True if it ran."""
    from . import ctc_refine

    if not words or not ctc_refine.available():
        return False
    before = [(w.start_ms / 1000, w.end_ms / 1000, w.confidence or 0.0) for w in words]
    after = ctc_refine.refine(samples, [w.text for w in words], before)
    if after is before:
        return False
    for w, (s, e, p) in zip(words, after):
        w.start_ms, w.end_ms = round(s * 1000), round(e * 1000)
        if w.confidence is not None:
            w.confidence = round(p, 3)
    return True

