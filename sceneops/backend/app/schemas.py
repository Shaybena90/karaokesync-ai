"""סכמות Pydantic לקלט ופלט של ה-API."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Optional

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

from .models import (
    CameraAdapter, CameraStatus, CaseStatus, CustodyType, ExhibitStatus, ExhibitType, FindingKind, JobStatus,
    MediaStatus, MediaType, NotificationLevel, Priority, ReportStatus, ReviewStatus, RoleName, SourceKind,
    StepStatus,
)


def _utc(d: datetime | None) -> str | None:
    return d.isoformat(timespec="seconds") + "Z" if d else None


def _local(d: datetime | None) -> str | None:
    return d.isoformat(timespec="seconds") if d else None


# זמן מערכת (UTC) / זמן מכשיר (ללא אזור זמן – כפי שנרשם)
UtcDT = Annotated[Optional[datetime], PlainSerializer(_utc, return_type=Optional[str])]
DeviceDT = Annotated[Optional[datetime], PlainSerializer(_local, return_type=Optional[str])]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _clean(v: str) -> str:
    return v.strip() if isinstance(v, str) else v


# ---------------------------------------------------------------- auth / users
class LoginIn(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class UserOut(ORM):
    id: int
    username: str
    full_name: str
    role: RoleName
    role_label: str
    is_active: bool
    is_demo: bool
    last_login_at: UtcDT = None


class UserBrief(ORM):
    id: int
    full_name: str


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    full_name: str = Field(min_length=2, max_length=128)
    password: str = Field(min_length=8, max_length=128)
    role: RoleName


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=128)
    role: Optional[RoleName] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=8, max_length=128)


# ---------------------------------------------------------------- cases
class CaseIn(BaseModel):
    reference: str = Field(min_length=3, max_length=32, pattern=r"^[0-9A-Za-z֐-׿/_-]+$")
    title: str = Field(min_length=2, max_length=200)
    description: str = Field("", max_length=5000)
    status: CaseStatus = CaseStatus.open
    priority: Priority = Priority.medium
    assigned_to_id: Optional[int] = None
    incident_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    notes: str = Field("", max_length=10000)

    _strip = field_validator("reference", "title", mode="before")(_clean)


class CaseUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    status: Optional[CaseStatus] = None
    priority: Optional[Priority] = None
    assigned_to_id: Optional[int] = None
    incident_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=10000)


class CaseOut(ORM):
    id: int
    reference: str
    title: str
    description: str
    status: CaseStatus
    priority: Priority
    assigned_to: Optional[UserBrief] = None
    incident_date: UtcDT = None
    opened_at: UtcDT = None
    due_date: UtcDT = None
    closed_at: UtcDT = None
    notes: str
    is_demo: bool
    created_at: UtcDT = None
    updated_at: UtcDT = None
    exhibit_count: int = 0
    media_count: int = 0
    active_jobs: int = 0


# ---------------------------------------------------------------- exhibits
class ExhibitIn(BaseModel):
    identifier: str = Field(min_length=1, max_length=32)
    label: str = Field(min_length=2, max_length=200)
    description: str = Field("", max_length=5000)
    exhibit_type: ExhibitType = ExhibitType.other
    source_device: str = Field("", max_length=200)
    location: str = Field("", max_length=200)
    acquisition_method: str = Field("", max_length=200)
    acquired_at: Optional[datetime] = None
    storage_reference: str = Field("", max_length=255)

    _strip = field_validator("identifier", "label", mode="before")(_clean)


class ExhibitUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    exhibit_type: Optional[ExhibitType] = None
    source_device: Optional[str] = Field(None, max_length=200)
    location: Optional[str] = Field(None, max_length=200)
    acquisition_method: Optional[str] = Field(None, max_length=200)
    acquired_at: Optional[datetime] = None
    storage_reference: Optional[str] = Field(None, max_length=255)
    status: Optional[ExhibitStatus] = None


class SourceOut(ORM):
    id: int
    exhibit_id: int
    kind: SourceKind
    path: str
    label: str
    authorization_note: str
    authorized_at: UtcDT = None
    last_scanned_at: UtcDT = None
    file_count: int
    total_bytes: int


class ExhibitOut(ORM):
    id: int
    case_id: int
    identifier: str
    label: str
    description: str
    exhibit_type: ExhibitType
    source_device: str
    location: str
    acquisition_method: str
    acquired_at: UtcDT = None
    acquired_by: Optional[UserBrief] = None
    storage_reference: str
    status: ExhibitStatus
    created_at: UtcDT = None
    media_count: int = 0
    sources: list[SourceOut] = []


class SourceIn(BaseModel):
    path: str = Field(min_length=1, max_length=1024)
    kind: SourceKind = SourceKind.folder
    label: str = Field("", max_length=200)
    authorization_note: str = Field(min_length=3, max_length=500)
    confirm_authorized: bool

    @field_validator("confirm_authorized")
    @classmethod
    def _must_confirm(cls, v: bool) -> bool:
        if not v:
            raise ValueError("יש לאשר כי קיימת הרשאה מפורשת לגישה למקור")
        return v


class CustodyIn(BaseModel):
    event_type: CustodyType
    description: str = Field(min_length=2, max_length=2000)
    from_party: str = Field("", max_length=200)
    to_party: str = Field("", max_length=200)
    location: str = Field("", max_length=200)
    occurred_at: Optional[datetime] = None


class CustodyOut(ORM):
    id: int
    exhibit_id: int
    event_type: CustodyType
    description: str
    from_party: str
    to_party: str
    location: str
    occurred_at: UtcDT = None
    recorded_by: Optional[UserBrief] = None
    job_id: Optional[int] = None


# ---------------------------------------------------------------- media
class HashOut(ORM):
    id: int
    target: str
    target_path: str
    algorithm: str
    value: str
    size_bytes: int
    matches_source: Optional[bool]
    job_id: Optional[int]
    computed_at: UtcDT = None


class WorkingCopyOut(ORM):
    id: int
    path: str
    sha256: str
    verified: bool
    verified_at: UtcDT = None
    has_thumbnail: bool = False
    has_proxy: bool = False


class MediaOut(ORM):
    id: int
    case_id: int
    exhibit_id: int
    source_id: int
    relative_path: str
    file_name: str
    extension: str
    size_bytes: int
    media_type: MediaType
    source_mtime: UtcDT = None
    duration_seconds: Optional[float]
    width: Optional[int]
    height: Optional[int]
    codec: str
    fps: Optional[float]
    container: str
    camera_label: str
    recorded_start: DeviceDT = None
    recorded_end: DeviceDT = None
    time_source: str
    warnings: list[str]
    status: MediaStatus
    source_sha256: Optional[str] = None
    working_copy: Optional[WorkingCopyOut] = None


class FindingOut(ORM):
    id: int
    case_id: int
    exhibit_id: Optional[int]
    media_file_id: Optional[int]
    kind: FindingKind
    camera_label: str
    start_time: DeviceDT = None
    end_time: DeviceDT = None
    media_offset_start: Optional[float]
    media_offset_end: Optional[float]
    score: Optional[float]
    description: str
    review_status: ReviewStatus
    reviewed_at: UtcDT = None
    job_id: Optional[int]


class FindingReview(BaseModel):
    review_status: ReviewStatus


class FrameIn(BaseModel):
    at_seconds: float = Field(ge=0, le=86400)


# ---------------------------------------------------------------- jobs
class JobCreate(BaseModel):
    workflow: str = Field(max_length=64)
    case_id: Optional[int] = None
    exhibit_id: Optional[int] = None
    source_id: Optional[int] = None
    report_title: Optional[str] = Field(None, max_length=200)
    report_id: Optional[int] = None


class StepOut(ORM):
    id: int
    order: int
    key: str
    name: str
    status: StepStatus
    progress: float
    attempts: int
    max_retries: int
    message: str
    error: str
    tool_versions: dict[str, Any]
    started_at: UtcDT = None
    finished_at: UtcDT = None


class JobOut(ORM):
    id: int
    workflow: str
    workflow_name: str = ""
    title: str
    status: JobStatus
    case_id: Optional[int]
    case_reference: Optional[str] = None
    exhibit_id: Optional[int]
    exhibit_identifier: Optional[str] = None
    camera_id: Optional[int]
    params: dict[str, Any]
    result: dict[str, Any]
    progress: float
    current_step: str
    error: str
    requires_approval: bool
    approved_at: UtcDT = None
    executor: str
    agent_id: Optional[int]
    attempts: int
    is_simulation: bool
    created_by: Optional[UserBrief] = None
    created_at: UtcDT = None
    started_at: UtcDT = None
    finished_at: UtcDT = None
    updated_at: UtcDT = None


class JobLogOut(ORM):
    id: int
    step_key: str
    level: str
    message: str
    created_at: UtcDT = None


class JobDetail(JobOut):
    steps: list[StepOut] = []
    logs: list[JobLogOut] = []


# ---------------------------------------------------------------- cameras
class ChannelIn(BaseModel):
    number: int = Field(ge=1, le=256)
    name: str = Field("", max_length=100)
    enabled: bool = True
    resolution: str = Field("", max_length=32)


class ChannelOut(ORM):
    id: int
    number: int
    name: str
    enabled: bool
    resolution: str


class CameraIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    vendor: str = Field("", max_length=100)
    model: str = Field("", max_length=100)
    device_type: str = Field("DVR", pattern=r"^(DVR|NVR|IPC)$")
    endpoint: str = Field("", max_length=255)
    location: str = Field("", max_length=200)
    timezone: str = Field("Asia/Jerusalem", max_length=64)
    clock_offset_seconds: int = Field(0, ge=-86400 * 365, le=86400 * 365)
    adapter: CameraAdapter = CameraAdapter.simulated
    authorization_ref: str = Field("", max_length=200)
    credential_ref: str = Field("", max_length=200)
    case_id: Optional[int] = None
    notes: str = Field("", max_length=5000)
    channels: list[ChannelIn] = []

    @field_validator("endpoint")
    @classmethod
    def _endpoint(cls, v: str) -> str:
        v = v.strip()
        if v and any(c in v for c in " *;|&`$<>"):
            raise ValueError("כתובת מכשיר מכילה תווים לא חוקיים; יש להזין כתובת מורשית אחת בלבד")
        return v


class CameraUpdate(BaseModel):
    vendor: Optional[str] = Field(None, max_length=100)
    model: Optional[str] = Field(None, max_length=100)
    endpoint: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=200)
    timezone: Optional[str] = Field(None, max_length=64)
    clock_offset_seconds: Optional[int] = None
    authorization_ref: Optional[str] = Field(None, max_length=200)
    credential_ref: Optional[str] = Field(None, max_length=200)
    case_id: Optional[int] = None
    notes: Optional[str] = Field(None, max_length=5000)
    channels: Optional[list[ChannelIn]] = None


class CameraOut(ORM):
    id: int
    name: str
    vendor: str
    model: str
    device_type: str
    endpoint: str
    location: str
    timezone: str
    clock_offset_seconds: int
    clock_offset_recorded_at: UtcDT = None
    adapter: CameraAdapter
    status: CameraStatus
    authorization_ref: str
    authorized_at: UtcDT = None
    credential_ref: str
    case_id: Optional[int]
    last_test_at: UtcDT = None
    last_test_result: str
    notes: str
    channels: list[ChannelOut] = []
    created_at: UtcDT = None


class ExportIn(BaseModel):
    exhibit_id: int
    channels: list[int] = Field(min_length=1, max_length=32)
    start: datetime
    end: datetime
    authorization_ref: str = Field(min_length=3, max_length=200)
    credential_confirmed: bool
    destination_note: str = Field("אחסון מקומי מאושר", max_length=200)

    @field_validator("credential_confirmed")
    @classmethod
    def _cred(cls, v: bool) -> bool:
        if not v:
            raise ValueError("יש לאשר שימוש בפרטי גישה מורשים")
        return v


# ---------------------------------------------------------------- reports
class ApprovalOut(ORM):
    id: int
    entity_type: str
    revision: Optional[int]
    decision: str
    comment: str
    user: UserBrief
    created_at: UtcDT = None


class RevisionOut(ORM):
    id: int
    revision: int
    pdf_sha256: str
    docx_sha256: str
    change_note: str
    job_id: Optional[int]
    created_by_id: Optional[int]
    created_at: UtcDT = None


class ReportOut(ORM):
    id: int
    case_id: int
    case_reference: str = ""
    title: str
    status: ReportStatus
    current_revision: int
    approved_at: UtcDT = None
    created_at: UtcDT = None
    updated_at: UtcDT = None


class ReportDetail(ReportOut):
    revisions: list[RevisionOut] = []
    approvals: list[ApprovalOut] = []
    content: dict[str, Any] = {}


class ReportCreate(BaseModel):
    case_id: int
    title: str = Field("דוח עיבוד מדיה", min_length=2, max_length=200)


class DecisionIn(BaseModel):
    decision: str = Field(pattern=r"^(approved|rejected)$")
    comment: str = Field("", max_length=2000)


# ---------------------------------------------------------------- misc
class NotificationOut(ORM):
    id: int
    level: NotificationLevel
    title: str
    body: str
    link: str
    read: bool
    job_id: Optional[int]
    created_at: UtcDT = None


class AuditOut(ORM):
    id: int
    created_at: UtcDT = None
    actor: str
    action: str
    entity_type: str
    entity_id: Optional[int]
    summary: str
    details: dict[str, Any]
    ip: str
    hash: str


class RootIn(BaseModel):
    path: str = Field(min_length=1, max_length=1024)
    label: str = Field("", max_length=200)
    confirm_authorized: bool


class RootOut(ORM):
    id: int
    path: str
    kind: str
    label: str
    active: bool
    created_at: UtcDT = None


class AgentIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    allowed_job_types: list[str]
    allowed_roots: list[str] = []


class AgentOut(ORM):
    id: int
    name: str
    kind: str
    agent_key: str
    enabled: bool
    allowed_job_types: list[str]
    allowed_roots: list[str]
    host: str
    version: str
    last_seen_at: UtcDT = None
    last_ip: str
    created_at: UtcDT = None
    online: bool = False


class RemoteJobIn(BaseModel):
    agent_id: int
    workflow: str
    case_id: int
    exhibit_id: Optional[int] = None
    source_id: Optional[int] = None
    justification: str = Field(min_length=5, max_length=500)
