"""Built-in animated backgrounds: 30 looping clips made by FFmpeg from a short
"recipe" each, and 23 3D scenes (GLSL shaders in /backgrounds3d, drawn ahead of
time by web/scripts/render-3d-backgrounds.mjs into web/public/backgrounds). The same recipe makes the preview clip the website plays and the
clip the worker puts behind the lyrics in an exported video, so both look the
same. Every recipe is periodic in time (it only uses whole turns of sin/cos and
whole steps of moving patterns), so the clip loops without a visible jump, and
nothing in it is random: the same recipe always gives the same pictures.
"""

from __future__ import annotations

import hashlib
import subprocess
from dataclasses import dataclass
from pathlib import Path

FPS = 30
WIDTH, HEIGHT = 640, 360  # soft, blurry pictures: scaled up when the video is made

# One full turn per loop, in geq's time variable T (seconds).
_TURN = "(2*PI*T/{p})"


@dataclass(frozen=True)
class AnimatedBackground:
    id: str
    name_he: str
    name_en: str
    seconds: int  # length of one loop
    source: str | None  # FFmpeg filter graph (no inputs) that draws one loop; None = a 3D scene
    kind: str = "classic"  # "classic" (FFmpeg recipe) | "3d" (pre-drawn clip only)

    @property
    def duration_ms(self) -> int:
        return self.seconds * 1000


# ------------------------------------------------------------------ helpers
def _rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _palette(stops: list[str]) -> str:
    """lutrgb that turns a grey picture (0..255) into colours, going through
    the given colours evenly from dark to bright."""
    cols = [_rgb(c) for c in stops]
    step = 255 / (len(cols) - 1)

    def channel(i: int) -> str:
        expr = str(cols[-1][i])
        for k in range(len(cols) - 2, -1, -1):  # nested if: segment k is [k*step, (k+1)*step)
            lo, a, b = k * step, cols[k][i], cols[k + 1][i]
            seg = f"{a}+({b - a})*(val-{lo:.3f})/{step:.3f}"
            expr = f"if(lt(val,{(k + 1) * step:.3f}),{seg},{expr})"
        return expr

    return f"format=rgb24,lutrgb=r='{channel(0)}':g='{channel(1)}':b='{channel(2)}'"


def _field(expr: str, stops: list[str], seconds: int = 10, blur: float = 0) -> str:
    """A grey pattern drawn by geq (0..255; may use A = one turn per loop), coloured by the palette."""
    expr = expr.replace("A", _TURN.format(p=seconds)).replace(" ", "")
    return (
        f"color=c=black:s={WIDTH}x{HEIGHT}:r={FPS}:d={seconds},format=gray,"
        f"geq=lum='clip({expr},0,255)',{f'gblur=sigma={blur},' if blur else ''}{_palette(stops)}"
    )


def _gradients(colors: list[str], kind: str, seed: int, seconds: int = 20, blur: int = 0) -> str:
    """FFmpeg's moving gradients; `speed` makes exactly one turn per loop."""
    cs = ":".join(f"c{i}=0x{c.lstrip('#')}" for i, c in enumerate(colors))
    speed = 2 * 3.141592653589793 / (seconds * FPS)
    tail = f",gblur=sigma={blur}" if blur else ""
    return (
        f"gradients=s={WIDTH}x{HEIGHT}:r={FPS}:d={seconds}:{cs}:nb_colors={len(colors)}"
        f":seed={seed}:speed={speed:.9f}:type={kind}{tail},format=rgb24"
    )


# ------------------------------------------------------------------ patterns (grey 0..255; X, Y, W, H, A)
# Sizes are relative to the height, so the look does not depend on the resolution.
PLASMA = (
    "128+30*(sin(X/H*7+A)+sin(Y/H*9-A)+sin((X+Y)/H*5+2*A)"
    "+sin(hypot(X-W/2,Y-H/2)/H*12-A))"
)
SOFT_PLASMA = "128+60*(sin(X/H*3+A)*cos(Y/H*4-A)+0.6*sin((X-Y)/H*2.5+2*A))"
RINGS = "40+90*(1+sin(hypot(X-W/2,Y-H/2)/H*28-3*A))*exp(-hypot(X-W/2,Y-H/2)/H*1.6)"
TUNNEL = (
    "128+70*sin(2.2/(hypot(X-W/2,Y-H/2)/H+0.08)-2*A)*min(1,hypot(X-W/2,Y-H/2)/H*3)"
    "+40*sin(6*atan2(Y-H/2,X-W/2)+A)*min(1,hypot(X-W/2,Y-H/2)/H*2)"
)
KALEIDO = (
    "128+55*sin(8*atan2(Y-H/2,X-W/2)+hypot(X-W/2,Y-H/2)/H*10-A)"
    "+55*cos(hypot(X-W/2,Y-H/2)/H*14+2*A)"
)
WAVES = (
    "50*(gt(Y,H*0.30+H*0.06*sin(X/H*4+A))+gt(Y,H*0.48+H*0.07*sin(X/H*3-A+1))"
    "+gt(Y,H*0.64+H*0.06*sin(X/H*5+2*A+2))+gt(Y,H*0.80+H*0.05*sin(X/H*4-2*A+3)))+30*(1-Y/H)"
)
AURORA = (
    "20*Y/H+230*(0.7+0.3*sin(X/H*26+2*A))*(0.75+0.25*sin(X/H*3-A))"
    "*if(gt(Y,H*(0.55+0.10*sin(X/H*2.2+A)+0.05*sin(X/H*5.5-2*A))),"
    "exp(-pow((Y-H*(0.55+0.10*sin(X/H*2.2+A)+0.05*sin(X/H*5.5-2*A)))/(H*0.035),2)),"
    "exp((Y-H*(0.55+0.10*sin(X/H*2.2+A)+0.05*sin(X/H*5.5-2*A)))/(H*0.22)))"
)
_STAR = "gt(mod(abs(sin(floor(X/2)*12.9898+floor(Y/2)*78.233))*43758.5453,1),{d})"
_TWINKLE = "(0.55+0.45*sin(2*A+mod(abs(sin(floor(X/2)*7.13+floor(Y/2)*3.71))*917.31,6.283)))"
STARS = (
    f"60*(1-Y/H)+45*exp(-pow((Y-H*(0.45+0.15*sin(X/H*1.5+A)))/(H*0.2),2))*(0.6+0.4*sin(X/H*2-A))"
    f"+210*{_STAR.format(d=0.992)}*{_TWINKLE}"
)
GALAXY_STARS = (
    f"150*exp(-pow(hypot(X-W/2,Y-H/2)/(H*0.6),2))"
    f"*(0.45+0.55*pow(0.5+0.5*sin(2*atan2(Y-H/2,X-W/2)-hypot(X-W/2,Y-H/2)/H*7+A),2))"
    f"+60*exp(-pow(hypot(X-W/2,Y-H/2)/(H*0.12),2))"
    f"+200*{_STAR.format(d=0.993)}*{_TWINKLE}"
)
SYNTH_GRID = (
    "if(gt(Y,H*0.58),"
    "  70+75*max(gt(mod(1/((Y-H*0.58)/H+0.004)*0.25-T/10*4,1),0.88),"
    "             lt(abs(mod((X-W/2)/(Y-H*0.58)*1.2+0.5,1)-0.5),0.06))*min(1,pow((Y-H*0.58)/H*7,2)),"
    "  if(lt(hypot(X-W/2,Y-H*0.40),H*0.24)*gt(mod(Y/H*40,4)-(Y-H*0.25)/H*12,0.0),"
    "     205+50*(H*0.58-Y)/H,"
    "     55*(Y/H)/0.58))"
)
BOKEH = (
    "20+140*(exp(-(pow(X-W*(0.5+0.30*cos(A)),2)+pow(Y-H*(0.5+0.25*sin(A)),2))/pow(H*0.18,2))"
    "+exp(-(pow(X-W*(0.5+0.32*cos(-A+2)),2)+pow(Y-H*(0.5+0.28*sin(-2*A+2)),2))/pow(H*0.14,2))"
    "+exp(-(pow(X-W*(0.5+0.25*sin(2*A+4)),2)+pow(Y-H*(0.5+0.30*cos(A+4)),2))/pow(H*0.20,2))"
    "+exp(-(pow(X-W*(0.5+0.38*cos(A+1)),2)+pow(Y-H*(0.5+0.18*sin(3*A+1)),2))/pow(H*0.11,2))"
    "+exp(-(pow(X-W*(0.5+0.20*sin(-A+5)),2)+pow(Y-H*(0.5+0.32*cos(2*A+5)),2))/pow(H*0.16,2)))"
)
LAVA = (
    "128+127*tanh(4*(exp(-(pow(X-W*(0.35+0.15*sin(A)),2)+pow(Y-H*(0.5+0.35*cos(A)),2))/pow(H*0.22,2))"
    "+exp(-(pow(X-W*(0.62+0.12*cos(2*A)),2)+pow(Y-H*(0.5+0.35*sin(-A+1)),2))/pow(H*0.2,2))"
    "+exp(-(pow(X-W*(0.5+0.25*sin(-A+3)),2)+pow(Y-H*(0.5+0.4*sin(A+2)),2))/pow(H*0.18,2))-0.55))"
)
STRIPES = "128+110*sin((X+Y*0.6)/H*9-2*A)*(0.6+0.4*sin(Y/H*3+A))"
CHECKER = (
    "128+100*sin((X-W/2)/H*10*cos(A/2)-(Y-H/2)/H*10*sin(A/2))"
    "*sin((X-W/2)/H*10*sin(A/2)+(Y-H/2)/H*10*cos(A/2))"
)
EQUALIZER = (
    "40*(1-Y/H)+lt(H-Y,H*(0.18+0.30*(0.5+0.5*sin(floor(X/(W/24))*1.7+2*A))"
    "*(0.6+0.4*sin(floor(X/(W/24))*0.9-3*A))))*gt(mod(X,W/24),W/24*0.18)*(120+135*(H-Y)/(H*0.6))"
)
SWIRL = "128+127*sin(atan2(Y-H/2,X-W/2)+hypot(X-W/2,Y-H/2)/H*5-A)"
HEARTBEAT = (
    "30+180*exp(-pow(hypot(X-W/2,Y-H/2)/(H*(0.28+0.06*pow(max(0,sin(4*A)),8))),2)*2)"
    "+40*(1+sin(hypot(X-W/2,Y-H/2)/H*16-4*A))*exp(-hypot(X-W/2,Y-H/2)/H*2)"
)
RAIN = (
    "18+20*Y/H+225*gt(mod(abs(sin(floor(X/6)*12.9898))*43758.5453,1),0.45)"
    "*pow(mod(Y/H*0.8-T/10*(1+floor(mod(abs(sin(floor(X/6)*3.77))*91.7,3)))"
    "+mod(abs(sin(floor(X/6)*7.1))*55.3,1),1),5)*gt(mod(X,6),1)"
)


# ------------------------------------------------------------------ the 30 backgrounds
def _all() -> list[AnimatedBackground]:
    g, f = _gradients, _field
    items = [
        ("sunset", "שקיעה", "Sunset", 20, g(["#ff512f", "#dd2476", "#ff9a3c", "#3a0ca3"], "linear", 3)),
        ("ocean", "אוקיינוס", "Ocean", 20, g(["#0f2027", "#2c5364", "#00b4db", "#0083b0"], "linear", 5)),
        ("aurora", "זוהר צפוני", "Northern lights", 10, f(AURORA, ["#020617", "#064e3b", "#10b981", "#67e8f9", "#f0abfc"])),
        ("neon-night", "לילה ניאון", "Neon night", 20, g(["#0b0033", "#ff00c8", "#00e5ff", "#370066"], "radial", 11)),
        ("candy", "סוכריה", "Candy", 20, g(["#ff9a9e", "#fecfef", "#a18cd1", "#fbc2eb"], "linear", 7)),
        ("forest", "יער", "Forest", 20, g(["#0b3d2e", "#1e5631", "#76b852", "#134e5e"], "radial", 9)),
        ("fire", "אש", "Fire", 10, f(PLASMA, ["#0a0000", "#7f1d1d", "#ea580c", "#facc15", "#fff7d6"])),
        ("royal", "מלכותי", "Royal", 20, g(["#1a0533", "#4c1d95", "#b8860b", "#2e1065"], "linear", 13)),
        ("mint", "מנטה", "Mint", 20, g(["#a8edea", "#5eead4", "#0d9488", "#ccfbf1"], "radial", 4)),
        ("peach", "אפרסק", "Peach", 20, g(["#ffecd2", "#fcb69f", "#ff8a80", "#ffd1a9"], "linear", 21)),
        ("galaxy", "גלקסיה", "Galaxy", 10, f(GALAXY_STARS, ["#02010a", "#1e1b4b", "#7c3aed", "#f0abfc", "#ffffff"])),
        ("rainbow-spiral", "ספירלת קשת", "Rainbow spiral", 10,
         f(SWIRL, ["#ff0040", "#ff9900", "#ffee00", "#00d26a", "#00a2ff", "#8a2be2", "#ff0040"])),
        ("gold", "זהב", "Gold", 10, f(SOFT_PLASMA, ["#1c1003", "#7a4b05", "#d4a017", "#fde68a", "#fffbeb"])),
        ("ice", "קרח", "Ice", 10, f(SOFT_PLASMA, ["#0b1d3a", "#1e3a8a", "#60a5fa", "#e0f2fe", "#ffffff"])),
        ("berry", "פירות יער", "Berry", 20, g(["#3b0a45", "#a4133c", "#ff4d6d", "#590d22"], "linear", 17)),
        ("plasma", "פלזמה", "Plasma", 10, f(PLASMA, ["#120458", "#7a04eb", "#ff00a0", "#ffd319", "#120458"])),
        ("pulse-rings", "טבעות דופק", "Pulse rings", 10, f(RINGS, ["#050014", "#3b0764", "#c026d3", "#f5d0fe"])),
        ("tunnel", "מנהרה", "Tunnel", 10, f(TUNNEL, ["#00010f", "#0c4a6e", "#06b6d4", "#e0f2fe", "#0c4a6e"])),
        ("kaleidoscope", "קליידוסקופ", "Kaleidoscope", 10,
         f(KALEIDO, ["#1a0b2e", "#e11d48", "#f59e0b", "#10b981", "#3b82f6", "#1a0b2e"])),
        ("starry-night", "לילה זרוע כוכבים", "Starry night", 10, f(STARS, ["#01030d", "#0f1d4a", "#3b4ea0", "#e2e8f0", "#ffffff"])),
        ("synthwave", "סינת'ווייב", "Synthwave", 10, f(SYNTH_GRID, ["#0d0221", "#2a0a5e", "#ff2a6d", "#ff7b00", "#ffe066"], blur=0.8)),
        ("bokeh", "אורות בוקה", "Bokeh lights", 10, f(BOKEH, ["#0a0612", "#4a1d6e", "#ec4899", "#fde68a", "#ffffff"])),
        ("sea-waves", "גלי ים", "Sea waves", 10, f(WAVES, ["#0c4a6e", "#0369a1", "#0ea5e9", "#7dd3fc", "#e0f2fe"])),
        ("lava-lamp", "מנורת לבה", "Lava lamp", 10, f(LAVA, ["#1e0336", "#5b0e5f", "#ff4f00", "#ffb703"])),
        ("disco", "דיסקו", "Disco", 10, f(CHECKER, ["#0f0326", "#7c3aed", "#ec4899", "#22d3ee", "#fde047"])),
        ("equalizer", "אקולייזר", "Equalizer", 10, f(EQUALIZER, ["#05010f", "#1e1250", "#22d3ee", "#a3e635", "#f472b6"])),
        ("heartbeat", "פעימות לב", "Heartbeat", 10, f(HEARTBEAT, ["#12000a", "#7f1d1d", "#e11d48", "#fda4af", "#fff1f2"])),
        ("digital-rain", "גשם דיגיטלי", "Digital rain", 10, f(RAIN, ["#000a03", "#022c16", "#16a34a", "#86efac", "#f0fdf4"])),
        ("silk", "משי", "Silk", 10, f(STRIPES, ["#1f1147", "#6d28d9", "#c4b5fd", "#fdf4ff", "#6d28d9"])),
        ("midnight", "חצות", "Midnight", 20, g(["#020024", "#1d1db5", "#00506b", "#3b0080"], "radial", 8)),
    ]
    scenes = [  # 3D scenes: backgrounds3d/<id>.frag, 10 s loops
        ("neon-tunnel", "מנהרת ניאון", "Neon tunnel"),
        ("retro-terrain", "הרי רטרו", "Retro mountains"),
        ("chrome-orbs", "כדורי כרום", "Chrome orbs"),
        ("liquid-chrome", "מתכת נוזלית", "Liquid chrome"),
        ("ringed-planet", "כוכב לכת", "Ringed planet"),
        ("stage-lights", "במת הופעה", "Concert stage"),
        ("gold-rings", "טבעות זהב", "Gold rings"),
        ("disco-ball", "כדור דיסקו", "Disco ball"),
        ("star-warp", "מסע בין כוכבים", "Star warp"),
        ("hex-floor", "רצפת משושים", "Hexagon floor"),
        ("ocean-sunset", "ים בשקיעה", "Ocean sunset"),
        ("cube-field", "קוביות מרחפות", "Floating cubes"),
        ("wedding-hearts", "לבבות חתונה", "Wedding hearts"),
        ("wedding-lights", "אורות חופה", "Fairy lights"),
        ("party-confetti", "מסיבת קונפטי", "Party confetti"),
        ("party-balloons", "בלונים", "Party balloons"),
        ("forest-fireflies", "יער גחליליות", "Firefly forest"),
        ("mountain-lake", "אגם הררי", "Mountain lake"),
        ("logo-spin", "לוגו מסתובב", "Spinning logo"),
        ("speaker-pulse", "רמקול פועם", "Pumping speaker"),
        ("speaker-duo", "רמקולים ולוגו", "Speakers and logo"),
        ("logo-neon", "שלט ניאון", "Neon sign"),
        ("logo-equalizer", "אקולייזר תלת מימד", "3D equalizer"),
    ]
    return [AnimatedBackground(i, he, en, s, src) for i, he, en, s, src in items] + [
        AnimatedBackground(i, he, en, 10, None, "3d") for i, he, en in scenes
    ]


BACKGROUNDS: dict[str, AnimatedBackground] = {b.id: b for b in _all()}

# The clips the website plays, committed to the repository (the worker runs
# from a copy of it, so it can use exactly the same files).
PREBUILT_DIR = Path(__file__).resolve().parents[2] / "web" / "public" / "backgrounds"


def render_clip(bg_id: str, out: Path, crf: int = 26, timeout: float = 600) -> Path:
    """Draw one loop of the background into an MP4 (H.264, no sound)."""
    bg = BACKGROUNDS[bg_id]
    if bg.source is None:
        raise ValueError(f"{bg_id} is a 3D scene: it is drawn by web/scripts/render-3d-backgrounds.mjs")
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".part.mp4")
    cmd = [
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", bg.source,
        "-frames:v", str(bg.seconds * FPS),
        "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p",
        "-g", str(FPS * 2), "-movflags", "+faststart", "-an", str(tmp),
    ]
    subprocess.run(cmd, check=True, capture_output=True, timeout=timeout)
    tmp.replace(out)
    return out


def cached_clip(bg_id: str, cache_dir: Path) -> Path:
    """The background's clip, drawn once and kept in cache_dir for later exports
    (a changed recipe gets a new file name, so an old clip is never reused)."""
    digest = hashlib.sha1((BACKGROUNDS[bg_id].source or "").encode()).hexdigest()[:10]
    out = cache_dir / f"{bg_id}-{digest}.mp4"
    if not out.exists():
        render_clip(bg_id, out)
    return out


def clip_for(bg_id: str, cache_dir: Path, prebuilt_dir: Path = PREBUILT_DIR) -> Path:
    """The clip to put behind the lyrics: the website's own file when this copy
    of the project has it (identical to the preview), otherwise drawn here from
    the recipe. A 3D scene only exists as a file (FileNotFoundError without it)."""
    prebuilt = prebuilt_dir / f"{bg_id}.mp4"
    if prebuilt.is_file():
        return prebuilt
    if BACKGROUNDS[bg_id].source is None:
        raise FileNotFoundError(prebuilt)
    return cached_clip(bg_id, cache_dir)
