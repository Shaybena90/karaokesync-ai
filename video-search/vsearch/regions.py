"""Regions of interest in normalized image coordinates.

Coordinates are fractions (0..1) of the decoded video image itself — not of the player element and
not including the player's letterbox bars. A rectangle is stored as a 4-point polygon.

Rule used in stage 1 (shown to the user before a search): a vehicle is "in the region" in a frame
when the CENTER of its bounding box lies inside the polygon. Line crossing / direction is a
different event type and is not part of stage 1.
"""
from __future__ import annotations

from dataclasses import dataclass

RULE_ID = "bbox_center_in_polygon"
RULE_TEXT_HE = "רכב נחשב בתוך האזור בפריים מסוים כאשר מרכז התיבה שלו נמצא בתוך האזור שסומן."


class RegionError(ValueError):
    pass


@dataclass(frozen=True)
class Region:
    points: tuple[tuple[float, float], ...]
    kind: str = "polygon"  # "rect" | "polygon"

    @staticmethod
    def from_json(d: dict) -> "Region":
        kind = d.get("kind", "polygon")
        pts = d.get("points") or []
        try:
            pts = tuple((float(x), float(y)) for x, y in pts)
        except (TypeError, ValueError) as e:
            raise RegionError("נקודות האזור אינן תקינות") from e
        if kind == "rect" and len(pts) == 2:
            (x0, y0), (x1, y1) = pts
            pts = ((x0, y0), (x1, y0), (x1, y1), (x0, y1))
        if len(pts) < 3:
            raise RegionError("אזור צריך לפחות 3 נקודות")
        for x, y in pts:
            if not (-1e-6 <= x <= 1 + 1e-6 and -1e-6 <= y <= 1 + 1e-6):
                raise RegionError("נקודות האזור חייבות להיות בתוך התמונה (0..1)")
        if abs(polygon_area(pts)) < 1e-5:
            raise RegionError("האזור שסומן קטן מדי או שטוח")
        return Region(points=pts, kind=kind)

    def to_json(self) -> dict:
        return {"kind": self.kind, "points": [list(p) for p in self.points], "rule": RULE_ID}

    def contains(self, x: float, y: float) -> bool:
        return point_in_polygon(x, y, self.points)

    def contains_box_center(self, box_xyxy_norm: tuple[float, float, float, float]) -> bool:
        x0, y0, x1, y1 = box_xyxy_norm
        return self.contains((x0 + x1) / 2, (y0 + y1) / 2)


def polygon_area(pts) -> float:
    a = 0.0
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        a += x0 * y1 - x1 * y0
    return a / 2


def point_in_polygon(x: float, y: float, pts) -> bool:
    """Even-odd ray casting. Points exactly on an edge count as inside."""
    n = len(pts)
    inside = False
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        # on-edge test
        cross = (x - x0) * (y1 - y0) - (y - y0) * (x1 - x0)
        if abs(cross) < 1e-12 and min(x0, x1) - 1e-12 <= x <= max(x0, x1) + 1e-12 \
                and min(y0, y1) - 1e-12 <= y <= max(y0, y1) + 1e-12:
            return True
        if (y0 > y) != (y1 > y):
            xi = x0 + (y - y0) * (x1 - x0) / (y1 - y0)
            if x < xi:
                inside = not inside
    return inside
