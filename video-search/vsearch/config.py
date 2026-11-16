from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("VSEARCH_DATA", ROOT / "data")))
    # Path to detector weights. No automatic download: if the file is missing the detector is "unavailable".
    detector_weights: Path = field(
        default_factory=lambda: Path(os.environ.get("VSEARCH_DETECTOR_WEIGHTS", ROOT / "models" / "yolo11n.pt"))
    )
    detector_imgsz: int = int(os.environ.get("VSEARCH_IMGSZ", "960"))
    detector_conf: float = float(os.environ.get("VSEARCH_DET_CONF", "0.25"))
    device: str = os.environ.get("VSEARCH_DEVICE", "cpu")

    @property
    def db_path(self) -> Path:
        return self.data_dir / "vsearch.sqlite3"

    @property
    def thumbs_dir(self) -> Path:
        return self.data_dir / "thumbs"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def exports_dir(self) -> Path:
        return self.data_dir / "exports"

    def ensure_dirs(self) -> None:
        for p in (self.data_dir, self.thumbs_dir, self.uploads_dir, self.exports_dir):
            p.mkdir(parents=True, exist_ok=True)
