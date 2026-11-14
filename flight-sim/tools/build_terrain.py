#!/usr/bin/env python3
"""Build a 16-bit heightmap for a geographic region from Copernicus DEM GLO-30 tiles.

Source data: Copernicus DEM GLO-30 (public AWS bucket copernicus-dem-30m), heights in metres
above the EGM2008 geoid (≈ above mean sea level). It is a *surface* model (DSM): it includes
buildings and vegetation.

Attribution (required): "Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and
© Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA;
all rights reserved."

Usage:
  python3 build_terrain.py --tiles DIR --out DIR --name negev \
      --south 30.40 --north 31.50 --west 34.30 --east 35.40 --size 2049
Download tiles first (no key needed):
  https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N30_00_E034_00_DEM/Copernicus_DSM_COG_10_N30_00_E034_00_DEM.tif
"""
import argparse, json, math, os, sys
import numpy as np
import tifffile
from PIL import Image

STEP = 1.0 / 3600.0  # 1 arc-second, PixelIsPoint, pixel(0,0) at (lon0, lat0+1)


def tile_name(lat, lon):
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM.tif"


class Mosaic:
    def __init__(self, tile_dir):
        self.dir = tile_dir
        self.cache = {}

    def tile(self, lat, lon):
        key = (lat, lon)
        if key not in self.cache:
            path = os.path.join(self.dir, tile_name(lat, lon))
            if not os.path.exists(path):
                sys.exit(f"missing DEM tile: {path}")
            arr = tifffile.imread(path).astype(np.float32)
            if arr.shape[1] != 3600:
                sys.exit(f"unexpected tile width {arr.shape} (only |lat|<50 tiles supported)")
            self.cache[key] = arr
        return self.cache[key]

    def sample(self, lat, lon):
        """Bilinear sample at arrays of lat/lon."""
        out = np.zeros(lat.shape, np.float32)
        tlat = np.floor(lat).astype(int)
        tlon = np.floor(lon).astype(int)
        for la in np.unique(tlat):
            for lo in np.unique(tlon):
                m = (tlat == la) & (tlon == lo)
                if not m.any():
                    continue
                a = self.tile(int(la), int(lo))
                r = (la + 1 - lat[m]) / STEP
                c = (lon[m] - lo) / STEP
                r0 = np.clip(np.floor(r).astype(int), 0, 3598)
                c0 = np.clip(np.floor(c).astype(int), 0, 3598)
                fr = np.clip(r - r0, 0, 1)
                fc = np.clip(c - c0, 0, 1)
                v = (a[r0, c0] * (1 - fr) * (1 - fc) + a[r0, c0 + 1] * (1 - fr) * fc
                     + a[r0 + 1, c0] * fr * (1 - fc) + a[r0 + 1, c0 + 1] * fr * fc)
                out[m] = v
        return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tiles", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--south", type=float, required=True)
    ap.add_argument("--north", type=float, required=True)
    ap.add_argument("--west", type=float, required=True)
    ap.add_argument("--east", type=float, required=True)
    ap.add_argument("--size", type=int, default=2049)
    a = ap.parse_args()

    mos = Mosaic(a.tiles)
    n = a.size
    lats = np.linspace(a.north, a.south, n)  # row 0 = north
    lons = np.linspace(a.west, a.east, n)
    LON, LAT = np.meshgrid(lons, lats)
    h = mos.sample(LAT, LON)
    h = np.where(np.isfinite(h) & (h > -1000), h, 0.0)

    hmin = float(math.floor(h.min()) - 1)
    hmax = float(math.ceil(h.max()) + 1)
    q = np.round((h - hmin) / (hmax - hmin) * 65535).astype(np.uint16)

    os.makedirs(a.out, exist_ok=True)
    png = os.path.join(a.out, f"{a.name}_height.png")
    Image.fromarray(q).save(png, optimize=True)
    raw = os.path.join(a.out, f"{a.name}_height.r16")
    q.astype("<u2").tofile(raw)

    mid = math.radians((a.north + a.south) / 2)
    meta = {
        "name": a.name,
        "format": "uint16 little-endian, row 0 = north edge, col 0 = west edge; regular lat/lon grid; samples on edges (PixelIsPoint)",
        "width": n, "height": n,
        "south": a.south, "north": a.north, "west": a.west, "east": a.east,
        "heightMinMeters": hmin, "heightMaxMeters": hmax,
        "verticalDatum": "EGM2008 geoid (approximately mean sea level)",
        "horizontalDatum": "WGS84 (EPSG:4326)",
        "approxSpacingMeters": {
            "northSouth": (a.north - a.south) / (n - 1) * 111132.0,
            "eastWest": (a.east - a.west) / (n - 1) * 111320.0 * math.cos(mid)},
        "surfaceModel": "DSM (includes buildings/vegetation)",
        "source": "Copernicus DEM GLO-30 via s3://copernicus-dem-30m (AWS Open Data)",
        "attribution": "Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.",
        "coverageClass": "real_elevation_data",
    }
    with open(os.path.join(a.out, f"{a.name}_height.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"wrote {png} ({os.path.getsize(png)//1024} KB), range {hmin}..{hmax} m")


if __name__ == "__main__":
    main()
