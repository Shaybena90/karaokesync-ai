"""SceneOps AI – שרת API."""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .config import PROJECT_DIR, get_settings
from .routers import auth, cameras, cases, jobs, media, remote, reports, system

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="SceneOps AI", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=False, allow_methods=["*"], allow_headers=["*"],
)


@app.middleware("http")
async def guard(request: Request, call_next):
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > settings.max_upload_mb * 1024 * 1024:
        return JSONResponse({"detail": f"גודל הבקשה חורג מהמותר ({settings.max_upload_mb}MB)"}, status_code=413)
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    return resp


_FIELD_HE = {"missing": "שדה חובה", "string_too_short": "ערך קצר מדי", "string_too_long": "ערך ארוך מדי",
             "string_pattern_mismatch": "פורמט לא תקין", "int_parsing": "יש להזין מספר שלם",
             "datetime_parsing": "תאריך לא תקין", "datetime_from_date_parsing": "תאריך לא תקין",
             "enum": "ערך לא מוכר", "greater_than_equal": "ערך נמוך מדי", "less_than_equal": "ערך גבוה מדי",
             "too_short": "יש לבחור לפחות פריט אחד", "bool_parsing": "ערך לא תקין"}


_LABELS = {"reference": "מספר תיק", "title": "כותרת", "description": "תיאור", "identifier": "מזהה מוצג",
           "label": "תיאור", "username": "שם משתמש", "password": "סיסמה", "full_name": "שם מלא", "name": "שם",
           "path": "נתיב", "authorization_note": "אסמכתת הרשאה", "authorization_ref": "אסמכתת הרשאה",
           "confirm_authorized": "אישור הרשאה", "credential_confirmed": "אישור פרטי גישה", "channels": "ערוצים",
           "start": "זמן התחלה", "end": "זמן סיום", "endpoint": "כתובת מכשיר", "event_type": "סוג אירוע",
           "exhibit_id": "מוצג", "case_id": "תיק", "justification": "הצדקה", "comment": "הערה",
           "at_seconds": "זמן בסרטון", "workflow": "תהליך", "agent_id": "סוכן", "number": "מספר ערוץ"}


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    errors = []
    for e in exc.errors():
        loc = [str(x) for x in e.get("loc", [])[1:]]
        field = " › ".join(_LABELS.get(x, x) for x in loc)
        msg = e.get("msg", "")
        if e.get("type") == "value_error":
            msg = msg.replace("Value error, ", "")
        else:
            msg = _FIELD_HE.get(e.get("type", ""), "ערך לא תקין")
        errors.append({"field": field, "message": msg})
    summary = "; ".join(f"{x['field']}: {x['message']}" if x["field"] else x["message"] for x in errors)
    return JSONResponse({"detail": f"שגיאת אימות נתונים – {summary}", "errors": errors}, status_code=422)


for r in (auth.router, cases.router, media.router, jobs.router, cameras.router, reports.router, remote.router,
          remote.agent_router, system.router):
    app.include_router(r)

settings.storage_root.mkdir(parents=True, exist_ok=True)

# הגשת ממשק המשתמש הבנוי (מצב הפעלה מאוחד) אם קיים
_DIST = PROJECT_DIR / "frontend" / "dist"
if _DIST.is_dir():

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "לא נמצא"}, status_code=404)
        candidate = (_DIST / full_path).resolve()
        if full_path and candidate.is_file() and str(candidate).startswith(str(_DIST.resolve())):
            return FileResponse(candidate)
        return FileResponse(Path(_DIST / "index.html"))
