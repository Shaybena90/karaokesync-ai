"""Build a SYNTHETIC test clip: the sample photo shipped with ultralytics (a bus with people)
slides across a plain background. It checks the plumbing with a real detector; it says nothing
about accuracy on real camera footage."""
import sys
from pathlib import Path

import cv2
import numpy as np
from ultralytics.utils import ASSETS

out = Path(sys.argv[1] if len(sys.argv) > 1 else "synthetic_bus.mp4")
img = cv2.imread(str(ASSETS / "bus.jpg"))
h = 420
img = cv2.resize(img, (int(img.shape[1] * h / img.shape[0]), h))
W, H, fps, secs = 1280, 720, 25, 6
vw = cv2.VideoWriter(str(out.with_suffix(".avi")), cv2.VideoWriter_fourcc(*"MJPG"), fps, (W, H))
n = fps * secs
for i in range(n):
    f = np.full((H, W, 3), 90, np.uint8)
    x = int(-img.shape[1] + (W + img.shape[1]) * i / (n - 1))
    x0, x1 = max(0, x), min(W, x + img.shape[1])
    if x1 > x0:
        f[150:150 + h, x0:x1] = img[:, x0 - x:x1 - x]
    vw.write(f)
vw.release()
import subprocess
subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(out.with_suffix(".avi")), "-c:v", "libx264",
                "-pix_fmt", "yuv420p", str(out)], check=True)
out.with_suffix(".avi").unlink()
print(out)
