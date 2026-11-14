#!/usr/bin/env python3
"""Probe Google Photorealistic 3D Tiles coverage depth over given points (official Map Tiles API).

STATUS: UNTESTED in the development environment (no API key; outbound access restricted).
COST: every run issues 1 root request per point plus one request per tile level traversed.
      Root requests are billable under the Map Tiles API — check current pricing first.
The key is read from the environment (KANAF_GOOGLE_MAPS_KEY); it is never written to disk.

Method: descend the tile tree choosing, at each level, the child whose bounding volume (OBB
"box" in ECEF) contains the target point; report the deepest level and its geometricError
(metres) — a proxy for the available detail. Nothing is cached or stored.

Usage: KANAF_GOOGLE_MAPS_KEY=... python3 tools/check_google_3dtiles_coverage.py
"""
import json, math, os, sys, urllib.parse, urllib.request

POINTS = {  # runway-area points (from bases.json) + towns in the phase-1 region
    "ramon": (30.7761, 34.6667), "nevatim": (31.2083, 35.0123), "hatzerim": (31.2334, 34.6626),
    "telnof": (31.8395, 34.8218), "ramatdavid": (32.6651, 35.1795), "hatzor": (31.7625, 34.7272),
    "mitzpe_ramon": (30.6104, 34.8015), "makhtesh_ramon": (30.58, 34.85),
}
A, F = 6378137.0, 1 / 298.257223563
E2 = F * (2 - F)


def ecef(lat, lon, h=0.0):
    la, lo = math.radians(lat), math.radians(lon)
    n = A / math.sqrt(1 - E2 * math.sin(la) ** 2)
    return ((n + h) * math.cos(la) * math.cos(lo), (n + h) * math.cos(la) * math.sin(lo), (n * (1 - E2) + h) * math.sin(la))


def inside_box(p, box, margin=1.05):
    c = box[0:3]; axes = [box[3:6], box[6:9], box[9:12]]
    d = [p[i] - c[i] for i in range(3)]
    for ax in axes:
        l2 = sum(a * a for a in ax)
        if l2 == 0: continue
        t = sum(d[i] * ax[i] for i in range(3)) / l2
        if abs(t) > margin: return False
    return True


def get(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def probe(key, lat, lon, max_levels=40):
    base = "https://tile.googleapis.com"
    root = get(f"{base}/v1/3dtiles/root.json?key={key}")
    p = ecef(lat, lon, 500)
    node, depth, session, best = root["root"], 0, None, None
    while depth < max_levels:
        best = (depth, node.get("geometricError"))
        kids = [k for k in node.get("children", []) if "box" in k.get("boundingVolume", {}) and inside_box(p, k["boundingVolume"]["box"])]
        if not kids:
            uri = node.get("content", {}).get("uri", "")
            if uri.endswith(".json"):
                q = urllib.parse.urlparse(uri)
                params = dict(urllib.parse.parse_qsl(q.query)); session = params.get("session", session)
                sub = get(f"{base}{q.path}?key={key}" + (f"&session={session}" if session else ""))
                node = sub["root"]; depth += 1; continue
            break
        node = min(kids, key=lambda k: k.get("geometricError", 1e9)); depth += 1
    return best


def main():
    key = os.environ.get("KANAF_GOOGLE_MAPS_KEY", "").strip()
    if not key:
        print("Set KANAF_GOOGLE_MAPS_KEY (see docs/MAPS.md). Nothing was requested."); return 2
    for name, (lat, lon) in POINTS.items():
        try:
            d, ge = probe(key, lat, lon)
            print(f"{name:15s} depth={d:3d} geometricError={ge}")
        except Exception as e:  # report and continue
            print(f"{name:15s} ERROR {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
