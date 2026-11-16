"""Word-by-word precision: refine Whisper's word times with CTC forced alignment.

Whisper's cross-attention says roughly where each word is sung; its edges are
often 0.1-0.3 s off in music. A CTC acoustic model looks at every 20 ms frame
and says which letter sounds there, so aligning the known letters of the words
to those frames gives much sharper word starts and ends.

The model is torchaudio's MMS_FA (trained on 1,100+ languages; it reads text
in Latin letters, so Hebrew and other scripts are romanised with uroman first).
It is used only when torchaudio and uroman are installed (they come with the
worker's AI packages); otherwise, or if anything looks wrong, Whisper's times
are kept unchanged. The model is downloaded once (about 1.2 GB) and cached.

Safety: a refined word that moved more than MAX_MOVE_S from Whisper's time,
or a stretch the model is unsure about, keeps Whisper's time.
"""

from __future__ import annotations

import importlib.util
import logging
import unicodedata
from functools import lru_cache

import numpy as np

log = logging.getLogger("karaokesync.ctc")

SAMPLE_RATE = 16000
MARGIN_S = 0.4          # audio kept around the stretch's words
MAX_MOVE_S = 0.8        # a refined edge further than this from Whisper's is not trusted
MIN_MEAN_PROB = 0.15    # below this the model did not really hear the words
MAX_CHUNK_S = 30.0      # longer stretches are aligned in parts
MIN_WORD_S = 0.06

# (start, end, probability) in seconds for each word.
WordTimes = list[tuple[float, float, float]]


def available() -> bool:
    return importlib.util.find_spec("torchaudio") is not None and importlib.util.find_spec("uroman") is not None


# The worker's WORD_REFINE setting ("auto" | "on" | "off"), set at the start of each job.
MODE = "auto"


def configure(mode: str) -> None:
    global MODE
    MODE = mode


def wanted() -> bool:
    return MODE != "off" and available()


@lru_cache(maxsize=1)
def _bundle():
    import torch
    from torchaudio.pipelines import MMS_FA

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = MMS_FA.get_model(with_star=False).to(device).eval()
    labels = MMS_FA.get_labels(star=None)
    return model, {c: i for i, c in enumerate(labels)}, device


@lru_cache(maxsize=1)
def _uroman():
    import uroman

    return uroman.Uroman()


def romanize(word: str, dictionary: dict[str, int]) -> list[int]:
    """The word as the model's letters (Latin, lower case); [] if nothing is left."""
    text = unicodedata.normalize("NFKC", word)
    try:
        text = _uroman().romanize_string(text)
    except Exception:  # noqa: BLE001 - an odd character must not stop the sync
        pass
    text = unicodedata.normalize("NFKD", text).lower()
    return [dictionary[c] for c in text if c in dictionary and c != "-"]


def emissions(samples: np.ndarray):
    """Log-probabilities of every letter, one row per 20 ms frame, and seconds per frame."""
    import torch

    model, _, device = _bundle()
    with torch.inference_mode():
        wave = torch.from_numpy(np.ascontiguousarray(samples, dtype=np.float32))[None].to(device)
        emission, _ = model(wave)
        emission = torch.log_softmax(emission, dim=-1)[0].cpu()
    return emission, len(samples) / SAMPLE_RATE / max(1, emission.shape[0])


def align_tokens(emission, token_lists: list[list[int]], frame_s: float) -> list[tuple[float, float, float] | None]:
    """Each word's (start, end, mean probability) in seconds within the emission; None for a word without letters."""
    import torch
    import torchaudio.functional as F

    targets = [t for tokens in token_lists for t in tokens]
    if not targets or emission.shape[0] < len(targets):
        return [None] * len(token_lists)
    aligned, scores = F.forced_align(emission[None], torch.tensor([targets], dtype=torch.int32), blank=0)
    spans = F.merge_tokens(aligned[0], scores[0].exp())
    out: list[tuple[float, float, float] | None] = []
    k = 0
    for tokens in token_lists:
        if not tokens:
            out.append(None)
            continue
        mine = spans[k: k + len(tokens)]
        k += len(tokens)
        prob = float(sum(s.score for s in mine) / len(mine))
        out.append((mine[0].start * frame_s, mine[-1].end * frame_s, prob))
    return out


def refine(samples: np.ndarray, words: list[str], times: WordTimes) -> WordTimes:
    """Sharper times for `words` sung in `samples` (16 kHz mono), starting from `times`
    (seconds from the start of `samples`). Returns `times` unchanged if refining is not
    possible or not convincing."""
    if not words or len(words) != len(times) or not available():
        return times
    try:
        _, dictionary, _ = _bundle()
    except Exception as exc:  # noqa: BLE001 - e.g. no internet for the first download
        log.warning("word refinement unavailable: %s", type(exc).__name__)
        return times
    out = list(times)
    # Parts of at most MAX_CHUNK_S, cut between words.
    start_i = 0
    while start_i < len(words):
        end_i = start_i
        while end_i + 1 < len(words) and times[end_i + 1][1] - times[start_i][0] < MAX_CHUNK_S - 2 * MARGIN_S:
            end_i += 1
        _refine_part(samples, words, times, out, start_i, end_i, dictionary)
        start_i = end_i + 1
    return out if out != list(times) else times


def _refine_part(samples, words, times, out, i0, i1, dictionary) -> None:
    t0 = max(0.0, times[i0][0] - MARGIN_S)
    t1 = min(len(samples) / SAMPLE_RATE, max(e for _, e, _ in times[i0: i1 + 1]) + MARGIN_S)
    clip = samples[int(t0 * SAMPLE_RATE): int(t1 * SAMPLE_RATE)]
    if len(clip) < SAMPLE_RATE // 4:
        return
    tokens = [romanize(w, dictionary) for w in words[i0: i1 + 1]]
    try:
        emission, frame_s = emissions(clip)
        found = align_tokens(emission, tokens, frame_s)
    except Exception as exc:  # noqa: BLE001 - never lose Whisper's result
        log.warning("word refinement failed: %s", type(exc).__name__)
        return
    heard = [f for f in found if f is not None]
    if not heard or sum(p for _, _, p in heard) / len(heard) < MIN_MEAN_PROB:
        return
    for k, f in enumerate(found):
        if f is None:
            continue
        i = i0 + k
        s, e, p = f[0] + t0, f[1] + t0, f[2]
        ws, we, wp = times[i]
        if abs(s - ws) > MAX_MOVE_S or abs(e - we) > MAX_MOVE_S + 0.4:
            continue
        out[i] = (s, max(e, s + MIN_WORD_S), max(wp, p))
    _keep_order(out)


def _keep_order(times: WordTimes) -> None:
    """Starts never go back in time and a word does not run into the next one."""
    for i in range(1, len(times)):
        s, e, p = times[i]
        if s < times[i - 1][0]:
            s = times[i - 1][0]
        times[i] = (s, max(e, s), p)
    for i in range(len(times) - 1):
        s, e, p = times[i]
        nxt = times[i + 1][0]
        if e > nxt >= s:
            times[i] = (s, nxt, p)
