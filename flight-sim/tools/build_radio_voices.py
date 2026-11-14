#!/usr/bin/env python3
"""Generate PLACEHOLDER Hebrew radio voice fragments with espeak-ng (phoneme input).

Why phoneme input: espeak-ng's Hebrew front-end cannot read unvocalised Hebrew (it drops vowels)
and spells out letter names for vocalised text, so every fragment carries a hand-written
phonetic transcription ('pron') that is fed as [[...]] phoneme input to the 'he' voice.

Output: Content/KanafData/Audio/Radio/<voice>/<fragment>.wav (mono 22050 Hz PCM16) and
manifest.json (durations, generator, licence notes). Only (voice, fragment) pairs actually used
by messages are generated.

Licence: espeak-ng is GPL-3.0; audio it *outputs* is not a derivative work of the program and
may be used in the game. These clips are placeholders: robotic quality, to be replaced by
recorded voice actors or a commercially-licensed Hebrew TTS (see docs/RADIO.md).
Usage: python3 tools/build_radio_voices.py
"""
import json, os, subprocess, sys, wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "KanafSim", "Content", "KanafData")
PHR = os.path.join(DATA, "Radio", "phrases.he.json")
OUT = os.path.join(DATA, "Audio", "Radio")


def expand(msg, book):
    frags = []
    for p in msg["parts"]:
        if p.startswith("@"):
            frags.append(p[1:])
        elif p == "$cs":
            frags += [f"cs_{c['id']}" for c in CALLSIGNS] + ["d1"]
        elif p == "$base":
            frags += [k for k in book["fragments"] if k.startswith("base_")]
        elif p == "$rw":
            frags += [f"d{i}" for i in range(10)] + ["rw_L", "rw_R", "rw_C"]
        elif p == "$altK":
            frags += [f"alt{i}" for i in range(1, 16)]
        elif p == "$wp":
            frags += [k for k in book["fragments"] if k.startswith("wp_")]
    return frags


def main():
    global CALLSIGNS
    book = json.load(open(PHR, encoding="utf-8"))
    missions = json.load(open(os.path.join(DATA, "Catalog", "missions.json"), encoding="utf-8"))
    CALLSIGNS = missions["callsignPool"]
    for c in CALLSIGNS:  # callsign pronunciations live in missions.json; mirror into fragments
        book["fragments"].setdefault(f"cs_{c['id']}", {"he": c["he"], "pron": c["pron"]})
    voices = {v["id"]: v for v in book["voices"]}
    pairs = set()
    for m in book["messages"]:
        for fr in expand(m, book):
            pairs.add((m["voice"], fr))
    manifest = {"generator": "espeak-ng " + subprocess.run(["espeak-ng", "--version"], capture_output=True, text=True).stdout.strip(),
                "quality": "placeholder", "sampleRate": 22050, "clips": {}}
    fails = []
    for voice, fr in sorted(pairs):
        f = book["fragments"].get(fr)
        if not f:
            fails.append(f"{voice}/{fr}: no fragment")
            continue
        es = voices[voice]["espeak"]
        d = os.path.join(OUT, voice)
        os.makedirs(d, exist_ok=True)
        tmp = os.path.join(d, fr + ".tmp.wav")
        dst = os.path.join(d, fr + ".wav")
        cmd = ["espeak-ng", "-v", f"he+{es['variant']}", "-p", str(es["pitch"]), "-s", str(es["speed"]), "-w", tmp,
               "[[" + f["pron"].replace(",", " ") + "]]"]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(tmp):
            fails.append(f"{voice}/{fr}: espeak failed {r.stderr.strip()}")
            continue
        # resample to 22050 mono PCM16 with ffmpeg (espeak-ng outputs 22050 already; normalise format)
        r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-ac", "1", "-ar", "22050", "-sample_fmt", "s16", dst])
        os.remove(tmp)
        if r.returncode != 0:
            fails.append(f"{voice}/{fr}: ffmpeg failed")
            continue
        with wave.open(dst) as w:
            dur = w.getnframes() / w.getframerate()
        manifest["clips"][f"{voice}/{fr}"] = {"seconds": round(dur, 3), "textHe": f["he"], "pron": f["pron"]}
    json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"generated {len(manifest['clips'])} clips, {len(fails)} failures")
    for x in fails:
        print("  FAIL", x)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
