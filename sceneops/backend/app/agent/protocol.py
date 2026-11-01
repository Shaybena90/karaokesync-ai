"""פרוטוקול חתימה לסוכן: HMAC-SHA256 על שיטה, נתיב, זמן, nonce וגיבוב גוף הבקשה.

הגנות: חלון זמן של 60 שניות, nonce חד-פעמי (הגנת replay), זהות סוכן מפורשת ורשימת משימות מותרת.
בפריסה ברשת יש להוסיף TLS הדדי (mTLS) וניהול מפתחות ארגוני.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time

WINDOW_SECONDS = 60


def derive_key(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def canonical(method: str, path: str, ts: str, nonce: str, body: bytes) -> bytes:
    return "\n".join([method.upper(), path, ts, nonce, hashlib.sha256(body).hexdigest()]).encode()


def sign(key_hex: str, method: str, path: str, ts: str, nonce: str, body: bytes) -> str:
    return hmac.new(key_hex.encode(), canonical(method, path, ts, nonce, body), hashlib.sha256).hexdigest()


def headers(agent_key: str, secret: str, method: str, path: str, body: bytes) -> dict[str, str]:
    ts, nonce = str(int(time.time())), secrets.token_hex(16)
    return {"X-Agent-Key": agent_key, "X-Agent-Timestamp": ts, "X-Agent-Nonce": nonce,
            "X-Agent-Signature": sign(derive_key(secret), method, path, ts, nonce, body),
            "Content-Type": "application/json"}
