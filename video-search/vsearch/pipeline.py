"""Search pipeline: decode → detect → track → region test → frame selection → attributes.

Attributes are computed for every track that entered the region; the user's fields (type / color /
make) are applied afterwards in `evaluate`, so correcting a field does not require re-processing.
"""
from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

from . import attributes as A
from .detection import TYPES_HE
from .media import DecodeReport, iter_frames
from .regions import RULE_ID, Region
from .tracking import IoUTracker

CROPS_PER_TRACK = 5
CONTEXT_WIDTH = 640


class Cancelled(Exception):
    pass


@dataclass
class TrackState:
    obs: list = field(default_factory=list)        # dicts: t, box(norm), in_region, score, type
    crops: list = field(default_factory=list)      # heap of (quality, seq, t, crop_bgr, in_region)
    context: tuple | None = None                   # (quality, t, small_frame_bgr, box_norm)
    seq: int = 0


@dataclass
class SearchParams:
    start: float = 0.0
    end: float | None = None
    rate: float | None = 10.0   # analysed frames per media second; None = every decoded frame


def _norm_box(b, w, h):
    return (max(0.0, b[0] / w), max(0.0, b[1] / h), min(1.0, b[2] / w), min(1.0, b[3] / h))


def _crop(img, b, pad=0.06):
    h, w = img.shape[:2]
    bw, bh = b[2] - b[0], b[3] - b[1]
    x0, y0 = int(max(0, b[0] - pad * bw)), int(max(0, b[1] - pad * bh))
    x1, y1 = int(min(w, b[2] + pad * bw)), int(min(h, b[3] + pad * bh))
    return img[y0:y1, x0:x1].copy()


def run_search(path: Path, region: Region, params: SearchParams, detector, make_clf,
               on_progress: Callable[[float, dict], None] | None = None,
               should_cancel: Callable[[], bool] | None = None) -> tuple[list[dict], dict]:
    """Returns (track_records, coverage). Raises Cancelled (with partial data attached) on cancel."""
    report = DecodeReport()
    tracker = IoUTracker(max_gap_s=1.0 if params.rate is None else max(1.0, 3.0 / params.rate))
    states: dict[int, TrackState] = {}
    records: list[dict] = []
    analysed = 0
    last_analysed_t = None
    max_gap = 0.0
    frame_w = frame_h = None

    def finish(tracks):
        for tr in tracks:
            st = states.pop(tr.track_id, None)
            if st is None:
                continue
            rec = _finalize(tr.track_id, st, make_clf)
            if rec is not None:
                records.append(rec)

    cancelled = False
    for t, img in iter_frames(path, params.start, params.end, report):
        if should_cancel and should_cancel():
            cancelled = True
            break
        if params.rate is not None and last_analysed_t is not None and t - last_analysed_t < (1.0 / params.rate) - 1e-4:
            continue
        if last_analysed_t is not None:
            max_gap = max(max_gap, t - last_analysed_t)
        last_analysed_t = t
        analysed += 1
        h, w = img.shape[:2]
        frame_w, frame_h = w, h
        dets = detector.detect(img)
        assigned, finished = tracker.update(t, dets)
        finish(finished)
        small = None
        for tr, di in assigned:
            d = dets[di]
            nb = _norm_box(d.box, w, h)
            inside = region.contains_box_center(nb)
            st = states.setdefault(tr.track_id, TrackState())
            st.obs.append({"t": round(t, 4), "box": [round(v, 5) for v in nb], "in": inside,
                           "score": round(d.score, 4), "type": d.obj_type})
            crop = _crop(img, d.box)
            area = (nb[2] - nb[0]) * (nb[3] - nb[1])
            q = area * math.sqrt(A.sharpness(crop) + 1.0) * (1.25 if inside else 1.0)
            st.seq += 1
            item = (q, st.seq, t, crop, inside)
            if len(st.crops) < CROPS_PER_TRACK:
                heapq.heappush(st.crops, item)
            elif q > st.crops[0][0]:
                heapq.heapreplace(st.crops, item)
            if inside and (st.context is None or q > st.context[0]):
                if small is None:
                    s = CONTEXT_WIDTH / w
                    small = cv2.resize(img, (CONTEXT_WIDTH, int(round(h * s)))) if s < 1 else img.copy()
                st.context = (q, t, small, nb)
        if on_progress:
            on_progress(t, {"frames_decoded": report.frames_decoded, "frames_analysed": analysed})

    finish(tracker.flush())
    coverage = {
        "requested_start": params.start,
        "requested_end": params.end,
        "processed_start": report.first_time,
        "processed_end": report.last_time,
        "frames_decoded": report.frames_decoded,
        "frames_analysed": analysed,
        "analysis_rate": params.rate,
        "sampled": params.rate is not None,
        "max_gap_between_analysed_frames": round(max_gap, 4),
        "decode": report.as_dict(),
        "frame_size": [frame_w, frame_h],
        "region_rule": RULE_ID,
        "cancelled": cancelled,
    }
    records.sort(key=lambda r: r["t_in_first"])
    if cancelled:
        e = Cancelled()
        e.records, e.coverage = records, coverage
        raise e
    return records, coverage


def _finalize(track_no: int, st: TrackState, make_clf) -> dict | None:
    inside = [o for o in st.obs if o["in"]]
    if not inside:
        return None
    votes: dict[str, float] = {}
    for o in st.obs:
        votes[o["type"]] = votes.get(o["type"], 0.0) + o["score"]
    total = sum(votes.values()) or 1.0
    type_votes = {k: round(v / total, 3) for k, v in sorted(votes.items(), key=lambda kv: -kv[1])}
    obj_type = next(iter(type_votes))

    crops = sorted(st.crops, key=lambda c: -c[0])
    color_readings = []
    make_readings = []
    for q, _, t, crop, ins in crops:
        if obj_type in ("person", "bicycle"):
            continue
        cr = A.classify_color(crop)
        cr["t"] = round(t, 4)
        color_readings.append(cr)
        if getattr(make_clf, "available", False):
            try:
                mr = make_clf.classify(crop)
            except Exception as e:  # one failing frame must not drop the track
                mr = {"make": None, "error": str(e)[:200]}
            mr["t"] = round(t, 4)
            make_readings.append(mr)

    color = A.aggregate(color_readings, "color") if color_readings else {"status": "not_applicable"}
    if color_readings:
        color["low_light_frames"] = sum(1 for r in color_readings if r.get("low_light"))
        color["readings"] = color_readings
        color["method"] = A.COLOR_VERSION
    if obj_type in ("person", "bicycle"):
        make = {"status": "not_applicable"}
    elif not getattr(make_clf, "available", False):
        make = {"status": "unavailable", "reason": getattr(make_clf, "unavailable_reason", None)}
    else:
        make = A.aggregate(make_readings, "make")
        make["readings"] = make_readings
        make["method"] = f"{make_clf.name} {make_clf.version}"

    return {
        "track_no": track_no,
        "obj_type": obj_type,
        "type_votes": type_votes,
        "t_first": st.obs[0]["t"],
        "t_last": st.obs[-1]["t"],
        "t_in_first": inside[0]["t"],
        "t_in_last": inside[-1]["t"],
        "n_obs": len(st.obs),
        "n_obs_in_region": len(inside),
        "det_score_max": max(o["score"] for o in st.obs),
        "color": color,
        "make": make,
        "observations": st.obs,
        # images are written by the caller (store)
        "_crops": [(round(t, 4), crop) for q, _, t, crop, ins in crops],
        "_context": (round(st.context[1], 4), st.context[2], st.context[3]) if st.context else None,
    }


# ---------- applying the user's fields ----------

def evaluate(rec: dict, fields: dict) -> dict:
    """Return {"category": match|candidate|excluded, "checks": {...}} for a stored track record."""
    checks = {}
    types = fields.get("types") or []
    if types:
        tv = rec.get("type_votes") or {rec["obj_type"]: 1.0}
        if rec["obj_type"] in types:
            checks["type"] = {"status": "match", "value": rec["obj_type"]}
        elif any(tv.get(x, 0) >= 0.3 for x in types):
            checks["type"] = {"status": "uncertain", "value": rec["obj_type"],
                              "note": "המודל התלבט בין סוגים: " + ", ".join(f"{TYPES_HE.get(k, k)}" for k in tv)}
        else:
            checks["type"] = {"status": "mismatch", "value": rec["obj_type"]}

    colors = fields.get("colors") or []
    c = rec.get("color") or {}
    if colors and c.get("status") != "not_applicable":
        low = c.get("frames") and c.get("low_light_frames", 0) * 2 >= c.get("frames", 0)
        st, val = c.get("status"), c.get("value")
        if st == "known" and val in colors:
            checks["color"] = {"status": "match", "value": val}
        elif st == "known":
            checks["color"] = ({"status": "uncertain", "value": val, "note": "תאורה חלשה — צבע לא אמין"}
                               if low else {"status": "mismatch", "value": val})
        elif st == "disputed":
            if any(x in (c.get("values") or {}) for x in colors):
                checks["color"] = {"status": "uncertain", "value": None, "note": "מחלוקת בין פריימים", "values": c.get("values")}
            else:
                checks["color"] = {"status": "mismatch", "value": None, "values": c.get("values")}
        else:
            checks["color"] = {"status": "uncertain", "value": val, "note": "צבע לא הוכרע"}

    makes = [m.lower() for m in (fields.get("makes") or [])]
    m = rec.get("make") or {}
    if makes and m.get("status") != "not_applicable":
        if m.get("status") == "unavailable":
            checks["make"] = {"status": "uncertain", "value": None, "note": "לא מחובר מסווג יצרנים — היצרן לא נבדק"}
        elif m.get("status") == "known" and str(m.get("value", "")).lower() in makes:
            checks["make"] = {"status": "match", "value": m["value"]}
        elif m.get("status") == "known":
            checks["make"] = {"status": "mismatch", "value": m["value"]}
        elif m.get("status") == "disputed":
            checks["make"] = {"status": "uncertain", "value": None, "note": "מחלוקת בין פריימים", "values": m.get("values")}
        else:
            checks["make"] = {"status": "uncertain", "value": m.get("value"), "note": "היצרן לא הוכרע"}
    elif makes:
        checks["make"] = {"status": "mismatch", "value": None, "note": "יצרן אינו רלוונטי לסוג זה"}

    sts = [v["status"] for v in checks.values()]
    if "mismatch" in sts:
        cat = "excluded"
    elif all(s == "match" for s in sts):
        cat = "match"
    else:
        cat = "candidate"
    return {"category": cat, "checks": checks}
