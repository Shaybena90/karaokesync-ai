"""Object detection behind a replaceable interface.

A general COCO detector finds "car", "truck", "bus", ... — that is NOT make recognition.
If the weights or the library are missing the detector reports itself as unavailable; it never
returns made-up boxes.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np

# Our object types (stable ids used by the query parser and the UI).
TYPES_HE = {
    "passenger_car": "רכב נוסעים",
    "truck": "משאית / טנדר",
    "bus": "אוטובוס",
    "motorcycle": "אופנוע",
    "bicycle": "אופניים",
    "person": "אדם",
}
VEHICLE_TYPES = ("passenger_car", "truck", "bus", "motorcycle")

COCO_TO_TYPE = {0: "person", 1: "bicycle", 2: "passenger_car", 3: "motorcycle", 5: "bus", 7: "truck"}


@dataclass
class Detection:
    box: tuple[float, float, float, float]  # pixels xyxy in the full-resolution frame
    obj_type: str
    score: float                            # detector score — not a calibrated probability
    raw_label: str


class Detector(Protocol):
    name: str
    version: str

    @property
    def available(self) -> bool: ...
    @property
    def unavailable_reason(self) -> str | None: ...
    def detect(self, image_bgr: np.ndarray) -> list[Detection]: ...


class UnavailableDetector:
    name = "none"
    version = "-"

    def __init__(self, reason: str):
        self._reason = reason

    @property
    def available(self) -> bool:
        return False

    @property
    def unavailable_reason(self) -> str | None:
        return self._reason

    def detect(self, image_bgr):
        raise RuntimeError(self._reason)


class UltralyticsDetector:
    name = "ultralytics-yolo"

    def __init__(self, weights: Path, imgsz: int = 960, conf: float = 0.25, device: str = "cpu"):
        from ultralytics import YOLO  # imported lazily: optional dependency
        import ultralytics

        self.weights = Path(weights)
        self.model = YOLO(str(self.weights))
        self.imgsz = imgsz
        self.conf = conf
        self.device = device
        self.version = f"ultralytics {ultralytics.__version__} / {self.weights.name}"
        names = self.model.names
        # Only map ids whose names match COCO, so a custom model with other classes is not misread.
        self._map = {i: t for i, t in COCO_TO_TYPE.items()
                     if i in names and names[i] in ("person", "bicycle", "car", "motorcycle", "bus", "truck")}
        self._classes = sorted(self._map)

    @property
    def available(self) -> bool:
        return True

    @property
    def unavailable_reason(self) -> str | None:
        return None

    def detect(self, image_bgr: np.ndarray) -> list[Detection]:
        r = self.model.predict(image_bgr, imgsz=self.imgsz, conf=self.conf, classes=self._classes,
                               device=self.device, verbose=False)[0]
        out = []
        if r.boxes is None:
            return out
        for xyxy, c, s in zip(r.boxes.xyxy.cpu().numpy(), r.boxes.cls.cpu().numpy(), r.boxes.conf.cpu().numpy()):
            ci = int(c)
            if ci not in self._map:
                continue
            out.append(Detection(tuple(float(v) for v in xyxy), self._map[ci], float(s), self.model.names[ci]))
        return out


def load_detector(weights: Path, imgsz: int, conf: float, device: str):
    if not Path(weights).is_file():
        return UnavailableDetector(f"קובץ משקולות הזיהוי לא נמצא: {weights}")
    try:
        return UltralyticsDetector(weights, imgsz=imgsz, conf=conf, device=device)
    except ImportError:
        return UnavailableDetector("ספריית ultralytics אינה מותקנת")
    except Exception as e:  # corrupt weights etc.
        return UnavailableDetector(f"טעינת מודל הזיהוי נכשלה: {e}")
