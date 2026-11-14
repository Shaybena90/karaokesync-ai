#!/usr/bin/env python3
"""Plot the phase-1 verification figure: DEM relief + bases/runways + automated circuit track.
Usage: python3 tools/plot_verification.py <flight.csv from kanaf_sim_cli> <out.png>"""
import csv, json, math, os, sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LightSource

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "KanafSim", "Content", "KanafData")
meta = json.load(open(os.path.join(DATA, "Terrain", "negev_height.json")))
raw = np.fromfile(os.path.join(DATA, "Terrain", "negev_height.r16"), dtype="<u2").reshape(meta["height"], meta["width"])
h = meta["heightMinMeters"] + raw / 65535.0 * (meta["heightMaxMeters"] - meta["heightMinMeters"])
bases = json.load(open(os.path.join(DATA, "Catalog", "bases.json"), encoding="utf-8"))["bases"]
ramon = next(b for b in bases if b["id"] == "ramon")
rows = list(csv.DictReader(open(sys.argv[1])))
lat0, lon0 = ramon["lat"], ramon["lon"]
mlat = 111132.954 - 559.822 * math.cos(2 * math.radians(lat0))
mlon = 111412.84 * math.cos(math.radians(lat0))
tr_lat = [lat0 + float(r["north"]) / mlat for r in rows]
tr_lon = [lon0 + float(r["east"]) / mlon for r in rows]

fig = plt.figure(figsize=(14, 7.5))
ax = fig.add_subplot(1, 2, 1)
ls = LightSource(azdeg=315, altdeg=40)
ext = [meta["west"], meta["east"], meta["south"], meta["north"]]
ax.imshow(ls.shade(h, cmap=plt.cm.terrain, vert_exag=0.02, blend_mode="soft", vmin=-430, vmax=1100), extent=ext, aspect=1 / math.cos(math.radians(31)))
for b in bases:
    for r in b["runways"]:
        e = r["ends"]
        ax.plot([e[0]["lon"], e[1]["lon"]], [e[0]["lat"], e[1]["lat"]], "k-", lw=2)
    if ext[0] <= b["lon"] <= ext[1] and ext[2] <= b["lat"] <= ext[3]:
        ax.annotate(b["nameEn"].replace(" Airbase", ""), (b["lon"], b["lat"]), xytext=(6, 6), textcoords="offset points", fontsize=9, weight="bold")
ax.plot(tr_lon, tr_lat, "r-", lw=1.2, label="automated circuit (core flight model)")
ax.set_xlim(34.45, 35.25); ax.set_ylim(30.55, 31.35)
ax.set_xlabel("longitude (WGS84)"); ax.set_ylabel("latitude (WGS84)")
ax.set_title("Copernicus DEM GLO-30 (Negev) + OurAirports runways")
ax.legend(loc="lower right", fontsize=8)
ax2 = fig.add_subplot(2, 2, 2)
t = [float(r["t"]) for r in rows]
ax2.plot(t, [float(r["altMsl"]) for r in rows], label="altitude MSL [m]")
ax2.plot(t, [float(r["agl"]) for r in rows], label="height AGL [m]")
ax2.set_ylabel("m"); ax2.legend(fontsize=8); ax2.grid(alpha=.3); ax2.set_title("Ramon 25L: take-off, circuit, ILS-like approach, landing")
ax3 = fig.add_subplot(2, 2, 4)
ax3.plot(t, [float(r["cas_kt"]) for r in rows], label="CAS [kt]")
ax3.plot(t, [float(r["alpha_deg"]) * 10 for r in rows], label="AoA x10 [deg]")
ax3.set_xlabel("time [s]"); ax3.legend(fontsize=8); ax3.grid(alpha=.3)
fig.text(0.01, 0.005, "Elevation: Copernicus WorldDEM-30 © DLR e.V. 2010-2014, © Airbus Defence and Space GmbH 2014-2018, Copernicus/EU/ESA. Runways: OurAirports (public domain).", fontsize=7)
plt.tight_layout(rect=(0, 0.02, 1, 1))
plt.savefig(sys.argv[2], dpi=110)
print("wrote", sys.argv[2])
