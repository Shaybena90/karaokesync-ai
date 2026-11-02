"""Automatic sync: find when each word typed in the editor is sung.

This is forced alignment: the words are already known, so Whisper does not
have to guess them. The audio is encoded once and Whisper's cross-attention is
aligned to the given text (dynamic time warping), the same technique
faster-whisper uses for its own word timestamps, but on the user's text.

Whisper looks at 30 seconds at a time. For a longer stretch, the singing is
first located with a quick transcription (biased towards the typed words), and
the alignment runs on that part only.
"""

from __future__ import annotations

import difflib
import logging
import re
import shutil
import tempfile
import unicodedata
from collections.abc import Callable
from pathlib import Path

from ..config import Settings
from ..supabase_client import SupabaseClient, SupabaseError
from .audio_tools import to_working_wav
from .errors import PipelineError
from .transcribe import _load_model, load_wav_16k

log = logging.getLogger("karaokesync.line_sync")

SAMPLE_RATE = 16000
MAX_ALIGN_SECONDS = 30.0
REGION_MARGIN_SECONDS = 1.0
MIN_WORD_MS = 80
MAX_TEXT_TOKENS = 400  # Whisper's decoder accepts 448 tokens, including the prompt

# Seconds → (start, end, probability) for each typed word.
WordTimes = list[tuple[float, float, float]]


def run_line_sync(job: dict, sb: SupabaseClient, settings: Settings, report: Callable[[int], None]) -> list[dict]:
    """Return one {start_ms, end_ms, confidence} per word of the job, in song time."""
    words = [str(w) for w in job["words"]]
    win_start, win_end = int(job["window_start_ms"]), int(job["window_end_ms"])
    audio_rows = sb.select(
        "audio_files",
        {"project_id": f"eq.{job['project_id']}", "status": "eq.verified", "select": "*",
         "order": "created_at.desc", "limit": "1"},
    )
    if not audio_rows:
        raise PipelineError("audio_missing", retryable=False)
    audio = audio_rows[0]

    Path(settings.worker_tmp_dir).mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(prefix=f"sync-{job['id'][:8]}-", dir=settings.worker_tmp_dir))
    try:
        source = workdir / f"source.{audio['storage_path'].rsplit('.', 1)[-1]}"
        try:
            url = sb.create_signed_url(settings.audio_bucket, audio["storage_path"], 300)
            sb.download_to(url, str(source), settings.max_upload_bytes)
        except SupabaseError as exc:
            raise PipelineError("download_failed", retryable=exc.status_code >= 500) from exc
        report(20)
        clip = to_working_wav(source, workdir / "window.wav", start_ms=win_start, end_ms=win_end)
        samples = load_wav_16k(clip)
        if len(samples) < SAMPLE_RATE // 5:
            raise PipelineError("invalid_sync_window", retryable=False)
        report(35)

        model = _load_model(settings.whisper_model, settings.whisper_device, settings.whisper_compute_type)
        report(50)
        times = align_words(model, samples, words, job.get("language"))
        report(95)
        return to_song_time(times, win_start, win_end)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# ------------------------------------------------------------------ alignment
def align_words(model, samples, words: list[str], language: str | None) -> WordTimes:
    """Times (seconds from the start of `samples`) for each word."""
    from faster_whisper.audio import pad_or_trim
    from faster_whisper.tokenizer import Tokenizer

    if not language:
        language = model.detect_language(audio=samples[: int(MAX_ALIGN_SECONDS * SAMPLE_RATE)])[0]

    offset = 0.0
    if len(samples) > MAX_ALIGN_SECONDS * SAMPLE_RATE:
        recognized = _recognize(model, samples, words, language)
        region = locate_region(recognized, words, len(samples) / SAMPLE_RATE)
        if region is None:
            raise PipelineError("sync_no_vocals", retryable=False)
        offset = region[0]
        samples = samples[int(region[0] * SAMPLE_RATE): int(region[1] * SAMPLE_RATE)]

    tokenizer = Tokenizer(model.hf_tokenizer, model.model.is_multilingual, task="transcribe", language=language)
    word_tokens = [tokenizer.encode(" " + w) for w in words]
    if sum(len(wt) for wt in word_tokens) > MAX_TEXT_TOKENS:
        raise PipelineError("sync_too_many_words", retryable=False)
    features = model.feature_extractor(samples)
    num_frames = min(model.feature_extractor.nb_max_frames, features.shape[-1] - 1)
    encoder_output = model.encode(pad_or_trim(features[:, :num_frames]))
    tokens = [t for wt in word_tokens for t in wt]
    alignment = model.find_alignment(tokenizer, [tokens], encoder_output, num_frames)[0]
    times = assign_to_words([len(wt) for wt in word_tokens], alignment)
    times = trim_edges(times)
    return [(s + offset, e + offset, p) for s, e, p in times]


def _recognize(model, samples, words: list[str], language: str) -> list[tuple[str, float, float]]:
    """Quick transcription of the stretch, biased towards the typed words."""
    segments, _ = model.transcribe(
        samples,
        language=language,
        word_timestamps=True,
        initial_prompt=" ".join(words),
        condition_on_previous_text=False,
        beam_size=1,
    )
    return [(w.word, float(w.start), float(w.end)) for seg in segments for w in seg.words or []]


def assign_to_words(token_counts: list[int], alignment: list[dict]) -> WordTimes:
    """Map Whisper's word list back to the typed words.

    Whisper re-splits the text (punctuation becomes its own "word"), so every
    aligned piece is attributed to the typed word that owns its first token.
    """
    owner = [i for i, n in enumerate(token_counts) for _ in range(n)]
    spans: list[list[float] | None] = [None] * len(token_counts)
    probs: list[list[float]] = [[] for _ in token_counts]
    pos = 0
    for piece in alignment:
        n = len(piece["tokens"])
        if n == 0 or pos >= len(owner):
            pos += n
            continue
        i = owner[pos]
        start, end = float(piece["start"]), float(piece["end"])
        spans[i] = [start, end] if spans[i] is None else [min(spans[i][0], start), max(spans[i][1], end)]
        probs[i].append(float(piece["probability"]))
        pos += n
    # A word without any piece (should not happen) sits right after its neighbour.
    out: WordTimes = []
    last_end = 0.0
    for span, p in zip(spans, probs):
        if span is None:
            out.append((last_end, last_end, 0.0))
            continue
        out.append((span[0], span[1], sum(p) / len(p)))
        last_end = span[1]
    return out


def trim_edges(times: WordTimes) -> WordTimes:
    """Dynamic time warping spreads the first and last word over any silence or
    music at the edges of the stretch; cap them at twice a typical word length."""
    if not times:
        return times
    inner = times[1:-1] if len(times) >= 3 else []  # the edge words are the suspects
    durations = sorted(e - s for s, e, _ in inner if e > s)
    median = durations[len(durations) // 2] if durations else 0.5
    cap = max(1.0, 2 * median)
    out = list(times)
    s, e, p = out[0]
    if e - s > cap:
        out[0] = (e - cap, e, p)
    s, e, p = out[-1]
    if e - s > cap:
        out[-1] = (s, s + cap, p)
    return out


_MARKS = re.compile(r"[֑-ׇ]")  # Hebrew cantillation and vowel points


def _norm(word: str) -> str:
    word = _MARKS.sub("", unicodedata.normalize("NFKC", word)).casefold()
    return "".join(ch for ch in word if ch.isalnum())


def locate_region(recognized: list[tuple[str, float, float]], words: list[str], total: float) -> tuple[float, float] | None:
    """Where in the stretch the typed words are sung, as at most 30 s with a margin.

    The recognized words that match typed words mark the region; if nothing
    matches, any singing at all is used. Returns None when nothing was heard.
    """
    heard = [(n, s, e) for n, s, e in ((_norm(w), s, e) for w, s, e in recognized) if n]
    if not heard:
        return None
    matcher = difflib.SequenceMatcher(None, [n for n, _, _ in heard], [_norm(w) for w in words], autojunk=False)
    hits = [heard[a + k] for a, _, size in matcher.get_matching_blocks() for k in range(size)]
    chosen = hits or heard
    start = max(0.0, min(s for _, s, _ in chosen) - REGION_MARGIN_SECONDS)
    end = min(total, max(e for _, _, e in chosen) + REGION_MARGIN_SECONDS)
    return start, min(end, start + MAX_ALIGN_SECONDS)


def to_song_time(times: WordTimes, window_start_ms: int, window_end_ms: int) -> list[dict]:
    """Seconds within the window → song milliseconds, keeping the editor's rules:
    starts never go back in time, end >= start, everything inside the window."""
    out: list[dict] = []
    prev_start = window_start_ms
    for i, (s, e, p) in enumerate(times):
        start = min(max(window_start_ms + round(s * 1000), prev_start), window_end_ms)
        end = min(max(window_start_ms + round(e * 1000), start + MIN_WORD_MS), window_end_ms)
        if i + 1 < len(times):  # do not run into the next word's start
            next_start = window_start_ms + round(times[i + 1][0] * 1000)
            if next_start > start:
                end = min(end, next_start)
        out.append({"start_ms": start, "end_ms": max(end, start), "confidence": round(max(0.0, min(1.0, p)), 3)})
        prev_start = start
    return out
