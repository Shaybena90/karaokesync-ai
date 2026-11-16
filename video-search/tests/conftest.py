import subprocess
from pathlib import Path

import numpy as np
import pytest
import cv2


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", *args], check=True)


@pytest.fixture(scope="session")
def media_dir(tmp_path_factory):
    return tmp_path_factory.mktemp("media")


@pytest.fixture(scope="session")
def cfr_video(media_dir) -> Path:
    p = media_dir / "cfr.mp4"
    ffmpeg("-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25:duration=4", "-pix_fmt", "yuv420p", str(p))
    return p


@pytest.fixture(scope="session")
def vfr_video(media_dir) -> Path:
    """50 frames at 25 fps, then a 1 s jump, then 10 fps — a real variable-frame-rate file."""
    p = media_dir / "vfr.mkv"
    ffmpeg("-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25:duration=4",
           "-vf", r"setpts='if(lt(N\,50)\,N/25\,3+(N-50)/10)/TB'", "-fps_mode", "passthrough",
           "-c:v", "libx264", "-pix_fmt", "yuv420p", str(p))
    return p


@pytest.fixture(scope="session")
def moving_box_video(media_dir) -> Path:
    """A white rectangle moving left→right over a dark background: 3 s, 20 fps, 640x360."""
    p = media_dir / "box.mp4"
    w, h, fps, n = 640, 360, 20, 60
    vw = cv2.VideoWriter(str(media_dir / "box_raw.avi"), cv2.VideoWriter_fourcc(*"MJPG"), fps, (w, h))
    for i in range(n):
        img = np.full((h, w, 3), 40, np.uint8)
        x = 20 + i * 9
        cv2.rectangle(img, (x, 150), (x + 80, 210), (250, 250, 250), -1)
        vw.write(img)
    vw.release()
    ffmpeg("-i", str(media_dir / "box_raw.avi"), "-pix_fmt", "yuv420p", "-c:v", "libx264", str(p))
    return p


def ffprobe_pts(p: Path) -> list[float]:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time",
                          "-of", "csv=p=0", str(p)], capture_output=True, text=True, check=True).stdout
    return sorted(float(x.strip(",")) for x in out.split() if x.strip(",").strip() not in ("", "N/A"))


class FakeDetection:
    def __init__(self, box, obj_type="passenger_car", score=0.9):
        self.box, self.obj_type, self.score, self.raw_label = box, obj_type, score, "car"


class BrightBlobDetector:
    """Test double: 'detects' the bright rectangle of moving_box_video. Used only in tests."""
    name, version, available, unavailable_reason = "test-bright-blob", "test", True, None

    def __init__(self, delay=0.0):
        self.delay = delay

    def detect(self, img):
        import time
        if self.delay:
            time.sleep(self.delay)
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        ys, xs = np.where(g > 200)
        if xs.size < 50:
            return []
        return [FakeDetection((float(xs.min()), float(ys.min()), float(xs.max() + 1), float(ys.max() + 1)))]


@pytest.fixture
def blob_detector():
    return BrightBlobDetector()
