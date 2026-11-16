"""Vehicle attributes: color and make, each with its own status and score.

* Color: a simple HSV pixel-share heuristic over the middle of the vehicle crop. It is a placeholder
  until a color model is tested on local footage. Its "share" value is the fraction of body pixels
  that fell in the winning color bin — NOT a probability.
* Make: no make classifier ships with stage 1. The interface exists so a tested engine
  (for example a self-hosted vehicle-analytics engine) can be plugged in. Until then make is
  reported as "unavailable" and results that need a make stay as candidates for review.

Per-frame readings are aggregated per track. When frames disagree the attribute is marked
"disputed" instead of picking a confident-looking answer.
"""
from __future__ import annotations

from collections import Counter
from typing import Protocol

import cv2
import numpy as np

COLOR_VERSION = "hsv-share-heuristic-0.1 (לא מכויל, לא נבדק על סרטונים מקומיים)"

COLORS_HE = {
    "white": "לבן", "black": "שחור", "gray": "אפור / כסוף", "red": "אדום", "orange": "כתום",
    "yellow": "צהוב", "green": "ירוק", "blue": "כחול", "brown": "חום / בז׳",
}

LOW_LIGHT_V = 0.28  # mean V below this → color readings are flagged as unreliable


def sharpness(img_bgr: np.ndarray) -> float:
    if img_bgr.size == 0:
        return 0.0
    g = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def classify_color(crop_bgr: np.ndarray) -> dict:
    """Return {"color": id|None, "share": float, "runner_up": id|None, "low_light": bool}."""
    h, w = crop_bgr.shape[:2]
    if h < 12 or w < 12:
        return {"color": None, "share": 0.0, "runner_up": None, "low_light": False, "reason": "חיתוך קטן מדי"}
    # central band: avoid road around the box, windows at the top and wheels at the bottom
    body = crop_bgr[int(h * 0.35):int(h * 0.8), int(w * 0.15):int(w * 0.85)]
    hsv = cv2.cvtColor(body, cv2.COLOR_BGR2HSV).reshape(-1, 3).astype(np.float32)
    H, S, V = hsv[:, 0] * 2, hsv[:, 1] / 255, hsv[:, 2] / 255
    bins = np.full(H.shape, "", dtype=object)
    achrom = S < 0.22
    bins[achrom & (V >= 0.72)] = "white"
    bins[achrom & (V < 0.25)] = "black"
    bins[achrom & (V >= 0.25) & (V < 0.72)] = "gray"
    chrom = ~achrom & (V >= 0.2)
    bins[~achrom & (V < 0.2)] = "black"
    for name, lo, hi in (("red", 345, 361), ("red", 0, 12), ("orange", 12, 35), ("yellow", 35, 70),
                         ("green", 70, 170), ("blue", 170, 260)):
        bins[chrom & (H >= lo) & (H < hi)] = name
    bins[chrom & (H >= 260) & (H < 345)] = "red"  # purple/magenta are rare car colors; fold into red
    brownish = chrom & (H >= 12) & (H < 45) & (V < 0.6) & (S < 0.6)
    bins[brownish] = "brown"
    c = Counter(b for b in bins.tolist() if b)
    total = sum(c.values())
    low_light = float(V.mean()) < LOW_LIGHT_V
    if not total:
        return {"color": None, "share": 0.0, "runner_up": None, "low_light": low_light}
    (top, n), *rest = c.most_common(2) + [(None, 0)]
    runner, rn = rest[0]
    share = n / total
    # undecided when the winner is weak or barely ahead of the runner-up
    if share < 0.4 or (rn and rn / total > share - 0.12):
        return {"color": None, "share": round(share, 3), "runner_up": top, "low_light": low_light,
                "reason": "אין צבע דומיננטי"}
    return {"color": top, "share": round(share, 3), "runner_up": runner, "low_light": low_light}


def aggregate(readings: list[dict], key: str) -> dict:
    """Combine per-frame readings → {"value", "status", "support", "frames", "values"}.

    status: "known" | "unknown" | "disputed"
    Similar consecutive frames are not independent evidence, so we report counts, not a product of scores.
    """
    vals = [r.get(key) for r in readings]
    known = [v for v in vals if v]
    cnt = Counter(known)
    res = {"frames": len(vals), "values": dict(cnt), "value": None, "status": "unknown", "support": 0}
    if not known:
        return res
    (top, n), *rest = cnt.most_common(2)
    res["support"] = n
    if rest and rest[0][1] >= max(1, 0.34 * len(known)):
        res["status"] = "disputed"
        return res
    if n < max(1, 0.5 * len(vals)):
        res["status"] = "unknown"
        res["value"] = top  # tentative, shown as uncertain
        return res
    res["value"], res["status"] = top, "known"
    return res


class MakeClassifier(Protocol):
    name: str
    version: str
    available: bool
    unavailable_reason: str | None

    def classify(self, crop_bgr: np.ndarray) -> dict:
        """Return {"make": str|None, "score": float|None, "alternatives": [...]}. None = cannot tell."""


class UnavailableMakeClassifier:
    name = "none"
    version = "-"
    available = False
    unavailable_reason = "לא מחובר מסווג יצרנים. זיהוי יצרן דורש מנוע ייעודי שנבדק על רכבים מקומיים."

    def classify(self, crop_bgr):
        raise RuntimeError(self.unavailable_reason)
