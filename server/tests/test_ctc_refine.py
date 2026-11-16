"""Word-by-word precision: CTC forced alignment sharpens Whisper's word times."""

import numpy as np
import pytest

from karaokesync.worker import alignment, ctc_refine
from karaokesync.worker.lines import Word

torch = pytest.importorskip("torch")
pytest.importorskip("torchaudio")


def fake_emission(frames: int, path: list[int], classes: int = 29):
    """Log-probabilities where frame k clearly says letter path[k] (0 = silence)."""
    e = torch.full((frames, classes), -12.0)
    for k, c in enumerate(path):
        e[k, c] = 0.0
    return e


def test_letters_are_grouped_back_into_words():
    # word 1 = letters [1, 2] at frames 10-13, word 2 = [3] at frames 30-33; 20 ms per frame
    path = [0] * 10 + [1, 1, 2, 2] + [0] * 16 + [3, 3, 3, 3] + [0] * 10
    out = ctc_refine.align_tokens(fake_emission(len(path), path), [[1, 2], [], [3]], 0.02)
    assert out[1] is None   # a word without letters keeps Whisper's time
    assert out[0][:2] == pytest.approx((0.20, 0.28)) and out[2][:2] == pytest.approx((0.60, 0.68))
    assert out[0][2] > 0.9


def test_refine_moves_edges_to_where_the_letters_are(monkeypatch):
    monkeypatch.setattr(ctc_refine, "available", lambda: True)
    monkeypatch.setattr(ctc_refine, "_bundle", lambda: (None, {"a": 1, "b": 2, "c": 3}, "cpu"))
    monkeypatch.setattr(ctc_refine, "romanize", lambda w, d: [d[ch] for ch in w])
    path = [0] * 10 + [1, 1, 2, 2] + [0] * 16 + [3, 3, 3, 3] + [0] * 66   # 2 s at 20 ms
    monkeypatch.setattr(ctc_refine, "emissions", lambda clip: (fake_emission(len(path), path), 0.02))
    samples = np.zeros(16000 * 2, dtype=np.float32)
    whisper = [(0.5, 0.9, 0.4), (0.9, 1.2, 0.5)]   # roughly right, edges sloppy
    out = ctc_refine.refine(samples, ["ab", "c"], whisper)
    # the clip starts 0.4 s before the first word (0.1 s): frames are relative to t0 = 0.1
    assert out[0][0] == pytest.approx(0.1 + 0.20, abs=0.03) and out[1][0] == pytest.approx(0.1 + 0.60, abs=0.03)
    assert out[0][1] <= out[1][0]


def test_unconvincing_or_far_results_keep_whisper(monkeypatch):
    monkeypatch.setattr(ctc_refine, "available", lambda: True)
    monkeypatch.setattr(ctc_refine, "_bundle", lambda: (None, {"a": 1}, "cpu"))
    monkeypatch.setattr(ctc_refine, "romanize", lambda w, d: [1])
    flat = torch.full((100, 29), float(np.log(1 / 29)))   # the model hears nothing in particular
    monkeypatch.setattr(ctc_refine, "emissions", lambda clip: (flat, 0.02))
    times = [(0.5, 0.8, 0.6)]
    assert ctc_refine.refine(np.zeros(32000, dtype=np.float32), ["a"], times) is times


def test_without_the_model_nothing_changes(monkeypatch):
    def broken():
        raise OSError("no internet")

    monkeypatch.setattr(ctc_refine, "available", lambda: True)
    monkeypatch.setattr(ctc_refine, "_bundle", broken)
    times = [(0.5, 0.8, 0.6)]
    assert ctc_refine.refine(np.zeros(16000, dtype=np.float32), ["a"], times) is times
    monkeypatch.setattr(ctc_refine, "available", lambda: False)
    words = [Word("a", 500, 800, 0.6)]
    assert alignment.align(words, "he", np.zeros(16000), refine_words=True) == (words, "whisper_dtw")


def test_hebrew_is_romanised_for_the_model():
    pytest.importorskip("uroman")
    labels = ("-", "a", "i", "e", "n", "o", "u", "t", "s", "r", "m", "k", "l", "d", "g", "h", "y", "b", "p", "w", "c", "v", "j",
              "z", "f", "'", "q", "x")
    ids = ctc_refine.romanize("שלום", {c: i for i, c in enumerate(labels)})
    assert ids and all(0 < i < len(labels) for i in ids)
    assert ctc_refine.romanize("!!!", {c: i for i, c in enumerate(labels)}) == []
