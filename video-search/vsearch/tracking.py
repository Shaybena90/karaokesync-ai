"""Simple multi-object tracker (greedy IoU, then motion-predicted center distance).

Purpose in stage 1: merge detections of the same pass into one result. It is deliberately simple
and replaceable. Known limits: long occlusions end a track (a new id starts), and two similar
vehicles crossing can swap ids. Gaps are measured in media seconds, so VFR / sampling is fine.
"""
from __future__ import annotations

from dataclasses import dataclass, field


def iou(a, b) -> float:
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    if inter <= 0:
        return 0.0
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


VEHICLE_GROUP = {"passenger_car", "truck", "bus"}  # detector often flips between these on one vehicle


def compatible(t1: str, t2: str) -> bool:
    return t1 == t2 or (t1 in VEHICLE_GROUP and t2 in VEHICLE_GROUP)


@dataclass
class Track:
    track_id: int
    obs: list = field(default_factory=list)  # list of (time, box, obj_type, score, extra)
    vel: tuple[float, float] = (0.0, 0.0)    # center velocity px/s

    @property
    def last_time(self) -> float:
        return self.obs[-1][0]

    @property
    def last_box(self):
        return self.obs[-1][1]

    def predicted_box(self, t: float):
        x0, y0, x1, y1 = self.last_box
        dt = t - self.last_time
        dx, dy = self.vel[0] * dt, self.vel[1] * dt
        return (x0 + dx, y0 + dy, x1 + dx, y1 + dy)

    def type_votes(self) -> dict:
        v: dict[str, float] = {}
        for o in self.obs:
            v[o[2]] = v.get(o[2], 0.0) + o[3]
        return v


class IoUTracker:
    def __init__(self, iou_thr: float = 0.3, max_gap_s: float = 1.0, dist_factor: float = 0.8):
        self.iou_thr = iou_thr
        self.max_gap_s = max_gap_s
        self.dist_factor = dist_factor
        self._next = 1
        self.active: list[Track] = []
        self.id_switch_suspects = 0

    def update(self, t: float, dets: list, extras: list | None = None) -> tuple[list[tuple[Track, int]], list[Track]]:
        """Feed detections of one analysed frame. Returns ([(track, det_index)], finished_tracks)."""
        extras = extras or [None] * len(dets)
        finished = [tr for tr in self.active if t - tr.last_time > self.max_gap_s]
        self.active = [tr for tr in self.active if tr not in finished]

        pairs = []
        for ti, tr in enumerate(self.active):
            pb = tr.predicted_box(t)
            for di, d in enumerate(dets):
                if not compatible(tr.obs[-1][2], d.obj_type):
                    continue
                v = iou(pb, d.box)
                if v >= self.iou_thr:
                    pairs.append((v, ti, di))
        pairs.sort(reverse=True)
        used_t, used_d, assign = set(), set(), {}
        for _, ti, di in pairs:
            if ti in used_t or di in used_d:
                continue
            used_t.add(ti); used_d.add(di); assign[di] = ti

        # second pass: predicted-center distance (fast movers / sparse sampling)
        cand = []
        for ti, tr in enumerate(self.active):
            if ti in used_t:
                continue
            pb = tr.predicted_box(t)
            pcx, pcy = (pb[0] + pb[2]) / 2, (pb[1] + pb[3]) / 2
            size = max(pb[2] - pb[0], pb[3] - pb[1])
            for di, d in enumerate(dets):
                if di in used_d or not compatible(tr.obs[-1][2], d.obj_type):
                    continue
                cx, cy = (d.box[0] + d.box[2]) / 2, (d.box[1] + d.box[3]) / 2
                dist = ((cx - pcx) ** 2 + (cy - pcy) ** 2) ** 0.5
                dsize = max(d.box[2] - d.box[0], d.box[3] - d.box[1])
                if dist <= self.dist_factor * size and 0.5 <= dsize / max(size, 1e-6) <= 2.0:
                    cand.append((dist, ti, di))
        cand.sort()
        for _, ti, di in cand:
            if ti in used_t or di in used_d:
                continue
            used_t.add(ti); used_d.add(di); assign[di] = ti

        out = []
        for di, d in enumerate(dets):
            if di in assign:
                tr = self.active[assign[di]]
                lt, lb = tr.last_time, tr.last_box
                dt = t - lt
                if dt > 0:
                    vx = ((d.box[0] + d.box[2]) - (lb[0] + lb[2])) / 2 / dt
                    vy = ((d.box[1] + d.box[3]) - (lb[1] + lb[3])) / 2 / dt
                    a = 0.5 if len(tr.obs) > 1 else 1.0
                    tr.vel = (a * vx + (1 - a) * tr.vel[0], a * vy + (1 - a) * tr.vel[1])
            else:
                tr = Track(self._next)
                self._next += 1
                self.active.append(tr)
            tr.obs.append((t, d.box, d.obj_type, d.score, extras[di]))
            out.append((tr, di))
        return out, finished

    def flush(self) -> list[Track]:
        f, self.active = self.active, []
        return f
