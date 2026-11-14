#!/usr/bin/env python3
"""Build the browser preview page from real exported data.
1) core-tests/build/kanaf_preview_export <dir>   2) encode tx*.wav to mp3 (ffmpeg)
3) python3 tools/preview/build_preview.py <dir> <out.html>"""
import base64, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "KanafSim", "Content", "KanafData")
src, out = sys.argv[1], sys.argv[2]
J = lambda p: json.load(open(p, encoding="utf-8"))
radio = J(os.path.join(src, "radio.json"))
audio = {}
for r in radio:
    mp3 = r["file"].replace(".wav", ".mp3")
    audio[r["file"]] = base64.b64encode(open(os.path.join(src, mp3), "rb").read()).decode()
air = J(os.path.join(DATA, "Catalog", "aircraft.json"))
comp = J(os.path.join(DATA, "Catalog", "compatibility.json"))
weap = {w["id"]: w for w in J(os.path.join(DATA, "Catalog", "weapons.json"))["weapons"]}
bases = J(os.path.join(DATA, "Catalog", "bases.json"))["bases"]
missions = J(os.path.join(DATA, "Catalog", "missions.json"))["missions"]
strings = J(os.path.join(DATA, "UI", "strings.he.json"))["s"]
dem = J(os.path.join(DATA, "Terrain", "negev_height.json"))
variants = [dict(id=v["id"], nameHe=v["nameHe"], nameEn=v["nameEn"], serviceStatus=v["serviceStatus"], flyable=v["implementationStatus"] == "flyable")
            for m in air["models"] for v in m["variants"]]
f16i = next(v for m in air["models"] for v in m["variants"] if v["id"] == "f16i")
entries = {(e["aircraft"], e["weapon"]): e for e in comp["entries"]}
presets = []
for p in comp["presets"]:
    if p["aircraft"] != "f16i": continue
    errs = []
    for st, w in p["stations"].items():
        e = entries.get(("f16i", w))
        if not e or e["evidence"] not in comp["selectableEvidence"]:
            errs.append(f'{weap[w]["nameEn"]}: אין התאמה מתועדת לגרסה F-16I Sufa')
        elif st not in e["gameStations"]:
            errs.append(f'{weap[w]["nameEn"]} אינו מוגדר לתחנה {st}')
    presets.append(dict(id=p["id"], nameHe=p["nameHe"], valid=not errs, errors=sorted(set(errs))))
cands = [f'{weap[e["weapon"]]["nameEn"]} — {e["evidence"]}' for e in comp["entries"] if e["aircraft"] == "f16i" and e["evidence"] not in comp["selectableEvidence"]]
inDem = lambda b: dem["south"] <= b["lat"] <= dem["north"] and dem["west"] <= b["lon"] <= dem["east"]
mission = next(m for m in missions if m["id"] == "pattern_practice")
screens = dict(strings=strings, aircraft=variants, presets=presets, candidates=cands,
               bases=[dict(id=b["id"], nameHe=b["nameHe"], icao=b["icao"], inDem=inDem(b)) for b in bases],
               mission=dict(nameHe=mission["nameHe"], briefingHe=mission["briefingHe"], objectives=[o["textHe"] for o in mission["objectives"]]),
               f16iNote=f16i["statusNote"] + " · נכסים: מודל זמני, קוקפיט זמני, צביעה חסרה")
data = dict(frames=J(os.path.join(src, "frames.json")), radio=radio, meta=J(os.path.join(src, "meta.json")),
            terrain=base64.b64encode(open(os.path.join(src, "terrain.bin"), "rb").read()).decode(), audio=audio, screens=screens)
tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "template.html"), encoding="utf-8").read()
html = tpl.replace("/*__DATA__*/null", json.dumps(data, ensure_ascii=False, separators=(",", ":")))
open(out, "w", encoding="utf-8").write(html)
print(f"wrote {out} ({os.path.getsize(out)//1024} KB)")
