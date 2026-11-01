"""מתאמי מכשירי CCTV/DVR/NVR.

ב-MVP קיים רק מתאם מדומה. מתאמי ONVIF Profile G ו-SDK של יצרנים מוגדרים כממשק בלבד
ויופעלו רק לאחר אינטגרציה מאושרת ארגונית. אין סריקת רשתות, ניחוש סיסמאות או עקיפת אימות.
"""
from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime

from ..models import Camera, CameraAdapter


@dataclass
class ConnectionResult:
    ok: bool
    message: str
    device_time_offset_seconds: int | None = None
    simulated: bool = True


class DeviceAdapter(ABC):
    """ממשק משותף לכל מתאמי המכשירים."""

    simulated: bool = False

    @abstractmethod
    def test_connection(self, camera: Camera) -> ConnectionResult: ...

    @abstractmethod
    def list_recordings(self, camera: Camera, channel: int, start: datetime, end: datetime) -> list[dict]: ...


class SimulatedAdapter(DeviceAdapter):
    simulated = True

    def test_connection(self, camera: Camera) -> ConnectionResult:
        # תוצאה דטרמיניסטית לפי שם המכשיר – אין תעבורת רשת כלל
        h = int(hashlib.sha256(camera.name.encode()).hexdigest(), 16)
        if not camera.endpoint:
            return ConnectionResult(False, "[סימולציה] לא הוגדרה כתובת מורשית למכשיר")
        if not camera.authorization_ref:
            return ConnectionResult(False, "[סימולציה] חסרה אסמכתת הרשאה – לא בוצע ניסיון חיבור")
        offset = camera.clock_offset_seconds or ((h % 600) - 300)
        return ConnectionResult(True, f"[סימולציה] המכשיר הגיב. היסט שעון משוער: {offset} שניות", offset)

    def list_recordings(self, camera: Camera, channel: int, start: datetime, end: datetime) -> list[dict]:
        return [{"channel": channel, "start": start.isoformat(), "end": end.isoformat(), "simulated": True}]


class NotIntegratedAdapter(DeviceAdapter):
    """נקודת חיבור עתידית. מחזירה שגיאה מפורשת עד לאינטגרציה מאושרת."""

    def __init__(self, name: str):
        self.name = name

    def test_connection(self, camera: Camera) -> ConnectionResult:
        return ConnectionResult(False, f"מתאם {self.name} טרם שולב. נדרשת אינטגרציה מאושרת ארגונית.", simulated=False)

    def list_recordings(self, camera, channel, start, end):  # noqa: ANN001
        raise NotImplementedError(f"מתאם {self.name} טרם שולב")


def adapter_for(camera: Camera) -> DeviceAdapter:
    if camera.adapter == CameraAdapter.simulated:
        return SimulatedAdapter()
    if camera.adapter == CameraAdapter.onvif_profile_g:
        return NotIntegratedAdapter("ONVIF Profile G")
    return NotIntegratedAdapter("SDK יצרן")
