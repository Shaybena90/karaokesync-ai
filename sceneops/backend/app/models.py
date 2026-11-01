"""מודלי נתונים של SceneOps AI."""
from __future__ import annotations

import enum
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, utcnow


def _enum(e: type[enum.Enum], name: str) -> Enum:
    return Enum(e, name=name, native_enum=False, validate_strings=True, length=32,
                values_callable=lambda x: [m.value for m in x])


# ---------------------------------------------------------------- enums
class RoleName(str, enum.Enum):
    admin = "admin"
    investigator = "investigator"
    viewer = "viewer"


class CaseStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    pending_review = "pending_review"
    closed = "closed"
    archived = "archived"


class Priority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class ExhibitType(str, enum.Enum):
    dvr = "dvr"
    storage_drive = "storage_drive"
    folder = "folder"
    removable = "removable"
    mobile = "mobile"
    other = "other"


class ExhibitStatus(str, enum.Enum):
    registered = "registered"
    processing = "processing"
    processed = "processed"
    released = "released"


class SourceKind(str, enum.Enum):
    folder = "folder"
    removable_drive = "removable_drive"
    dvr_export = "dvr_export"
    simulated_export = "simulated_export"


class CameraStatus(str, enum.Enum):
    unknown = "unknown"
    online = "online"
    offline = "offline"
    error = "error"


class CameraAdapter(str, enum.Enum):
    simulated = "simulated"
    onvif_profile_g = "onvif_profile_g"
    vendor_sdk = "vendor_sdk"


class MediaType(str, enum.Enum):
    video = "video"
    image = "image"
    audio = "audio"
    other = "other"


class MediaStatus(str, enum.Enum):
    inventoried = "inventoried"
    hashed = "hashed"
    copied = "copied"
    verified = "verified"
    indexed = "indexed"
    error = "error"


class HashTarget(str, enum.Enum):
    source = "source"
    working_copy = "working_copy"
    report = "report"


class FindingKind(str, enum.Enum):
    motion = "motion"
    gap = "gap"
    time_inconsistency = "time_inconsistency"
    integrity = "integrity"


class ReviewStatus(str, enum.Enum):
    candidate = "candidate"
    confirmed = "confirmed"
    rejected = "rejected"


class JobStatus(str, enum.Enum):
    awaiting_approval = "awaiting_approval"
    queued = "queued"
    running = "running"
    cancel_requested = "cancel_requested"
    cancelled = "cancelled"
    succeeded = "succeeded"
    failed = "failed"


class StepStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    skipped = "skipped"
    cancelled = "cancelled"


class ReportStatus(str, enum.Enum):
    draft = "draft"
    in_review = "in_review"
    approved = "approved"
    rejected = "rejected"


class Decision(str, enum.Enum):
    approved = "approved"
    rejected = "rejected"


class CustodyType(str, enum.Enum):
    received = "received"
    acquired = "acquired"
    transferred = "transferred"
    hashed = "hashed"
    copied = "copied"
    verified = "verified"
    exported = "exported"
    stored = "stored"
    returned = "returned"


class NotificationLevel(str, enum.Enum):
    info = "info"
    success = "success"
    warning = "warning"
    error = "error"


class AgentKind(str, enum.Enum):
    local_worker = "local_worker"
    remote_agent = "remote_agent"


class RootKind(str, enum.Enum):
    source = "source"
    destination = "destination"


# ---------------------------------------------------------------- users
class Role(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[RoleName] = mapped_column(_enum(RoleName, "role_name"), unique=True)
    label: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(String(255), default="")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(128))
    password_hash: Mapped[str] = mapped_column(String(255))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    role: Mapped[Role] = relationship(lazy="joined")


class UserSession(Base):
    __tablename__ = "user_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    ip: Mapped[str] = mapped_column(String(64), default="")


# ---------------------------------------------------------------- cases
class Case(Base):
    __tablename__ = "cases"
    __table_args__ = (Index("ix_cases_status_priority", "status", "priority"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[CaseStatus] = mapped_column(_enum(CaseStatus, "case_status"), default=CaseStatus.open)
    priority: Mapped[Priority] = mapped_column(_enum(Priority, "priority"), default=Priority.medium)
    assigned_to_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    incident_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    notes: Mapped[str] = mapped_column(Text, default="")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    assigned_to: Mapped[Optional[User]] = relationship(foreign_keys=[assigned_to_id], lazy="joined")
    exhibits: Mapped[list["Exhibit"]] = relationship(back_populates="case", order_by="Exhibit.identifier")


class Exhibit(Base):
    __tablename__ = "exhibits"
    __table_args__ = (UniqueConstraint("case_id", "identifier", name="uq_exhibit_case_identifier"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    identifier: Mapped[str] = mapped_column(String(32))
    label: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    exhibit_type: Mapped[ExhibitType] = mapped_column(_enum(ExhibitType, "exhibit_type"), default=ExhibitType.other)
    source_device: Mapped[str] = mapped_column(String(200), default="")
    location: Mapped[str] = mapped_column(String(200), default="")
    acquisition_method: Mapped[str] = mapped_column(String(200), default="")
    acquired_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    acquired_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    storage_reference: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[ExhibitStatus] = mapped_column(_enum(ExhibitStatus, "exhibit_status"), default=ExhibitStatus.registered)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    case: Mapped[Case] = relationship(back_populates="exhibits")
    acquired_by: Mapped[Optional[User]] = relationship(lazy="joined")


class EvidenceSource(Base):
    __tablename__ = "evidence_sources"
    id: Mapped[int] = mapped_column(primary_key=True)
    exhibit_id: Mapped[int] = mapped_column(ForeignKey("exhibits.id", ondelete="CASCADE"), index=True)
    kind: Mapped[SourceKind] = mapped_column(_enum(SourceKind, "source_kind"), default=SourceKind.folder)
    path: Mapped[str] = mapped_column(String(1024))
    label: Mapped[str] = mapped_column(String(200), default="")
    authorized_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    authorized_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    authorization_note: Mapped[str] = mapped_column(String(500), default="")
    last_scanned_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    file_count: Mapped[int] = mapped_column(Integer, default=0)
    total_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class CustodyEvent(Base):
    __tablename__ = "custody_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    exhibit_id: Mapped[int] = mapped_column(ForeignKey("exhibits.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[CustodyType] = mapped_column(_enum(CustodyType, "custody_type"))
    description: Mapped[str] = mapped_column(Text, default="")
    from_party: Mapped[str] = mapped_column(String(200), default="")
    to_party: Mapped[str] = mapped_column(String(200), default="")
    location: Mapped[str] = mapped_column(String(200), default="")
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    recorded_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    recorded_by: Mapped[Optional[User]] = relationship(lazy="joined")


# ---------------------------------------------------------------- cameras
class Camera(Base):
    __tablename__ = "cameras"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    vendor: Mapped[str] = mapped_column(String(100), default="")
    model: Mapped[str] = mapped_column(String(100), default="")
    device_type: Mapped[str] = mapped_column(String(16), default="DVR")
    endpoint: Mapped[str] = mapped_column(String(255), default="")
    location: Mapped[str] = mapped_column(String(200), default="")
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Jerusalem")
    clock_offset_seconds: Mapped[int] = mapped_column(Integer, default=0)
    clock_offset_recorded_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    adapter: Mapped[CameraAdapter] = mapped_column(_enum(CameraAdapter, "camera_adapter"), default=CameraAdapter.simulated)
    status: Mapped[CameraStatus] = mapped_column(_enum(CameraStatus, "camera_status"), default=CameraStatus.unknown)
    authorization_ref: Mapped[str] = mapped_column(String(200), default="")
    authorized_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    authorized_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    credential_ref: Mapped[str] = mapped_column(String(200), default="")
    case_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cases.id", ondelete="SET NULL"))
    last_test_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_test_result: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    channels: Mapped[list["Channel"]] = relationship(back_populates="camera", order_by="Channel.number",
                                                     cascade="all, delete-orphan")


class Channel(Base):
    __tablename__ = "channels"
    __table_args__ = (UniqueConstraint("camera_id", "number", name="uq_channel_camera_number"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(100), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    resolution: Mapped[str] = mapped_column(String(32), default="")

    camera: Mapped[Camera] = relationship(back_populates="channels")


# ---------------------------------------------------------------- media
class MediaFile(Base):
    __tablename__ = "media_files"
    __table_args__ = (
        UniqueConstraint("source_id", "relative_path", name="uq_media_source_path"),
        Index("ix_media_case_camera", "case_id", "camera_label"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    exhibit_id: Mapped[int] = mapped_column(ForeignKey("exhibits.id", ondelete="CASCADE"), index=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("evidence_sources.id", ondelete="CASCADE"), index=True)
    relative_path: Mapped[str] = mapped_column(String(1024))
    file_name: Mapped[str] = mapped_column(String(255), index=True)
    extension: Mapped[str] = mapped_column(String(16), default="")
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    media_type: Mapped[MediaType] = mapped_column(_enum(MediaType, "media_type"), default=MediaType.other)
    source_mtime: Mapped[Optional[datetime]] = mapped_column(DateTime)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float)
    width: Mapped[Optional[int]] = mapped_column(Integer)
    height: Mapped[Optional[int]] = mapped_column(Integer)
    codec: Mapped[str] = mapped_column(String(64), default="")
    fps: Mapped[Optional[float]] = mapped_column(Float)
    container: Mapped[str] = mapped_column(String(64), default="")
    camera_label: Mapped[str] = mapped_column(String(64), default="")
    recorded_start: Mapped[Optional[datetime]] = mapped_column(DateTime)
    recorded_end: Mapped[Optional[datetime]] = mapped_column(DateTime)
    time_source: Mapped[str] = mapped_column(String(32), default="")
    warnings: Mapped[list[Any]] = mapped_column(JSON, default=list)
    probe: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[MediaStatus] = mapped_column(_enum(MediaStatus, "media_status"), default=MediaStatus.inventoried)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    source: Mapped[EvidenceSource] = relationship(lazy="joined")
    hashes: Mapped[list["HashRecord"]] = relationship(back_populates="media_file", order_by="HashRecord.id")
    working_copy: Mapped[Optional["WorkingCopy"]] = relationship(back_populates="media_file", uselist=False)


class HashRecord(Base):
    __tablename__ = "hash_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    media_file_id: Mapped[Optional[int]] = mapped_column(ForeignKey("media_files.id", ondelete="CASCADE"), index=True)
    target: Mapped[HashTarget] = mapped_column(_enum(HashTarget, "hash_target"))
    target_path: Mapped[str] = mapped_column(String(1024), default="")
    algorithm: Mapped[str] = mapped_column(String(16), default="SHA-256")
    value: Mapped[str] = mapped_column(String(128), index=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    matches_source: Mapped[Optional[bool]] = mapped_column(Boolean)
    job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"))
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    media_file: Mapped[Optional[MediaFile]] = relationship(back_populates="hashes")


class WorkingCopy(Base):
    __tablename__ = "working_copies"
    id: Mapped[int] = mapped_column(primary_key=True)
    media_file_id: Mapped[int] = mapped_column(ForeignKey("media_files.id", ondelete="CASCADE"), unique=True)
    path: Mapped[str] = mapped_column(String(1024))  # יחסי לשורש האחסון
    sha256: Mapped[str] = mapped_column(String(64), default="")
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    thumbnail_path: Mapped[str] = mapped_column(String(1024), default="")
    proxy_path: Mapped[str] = mapped_column(String(1024), default="")
    job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    media_file: Mapped[MediaFile] = relationship(back_populates="working_copy")


class Finding(Base):
    """ממצא אלגוריתמי – מועמד לבדיקה בלבד, לא קביעה עובדתית."""
    __tablename__ = "findings"
    __table_args__ = (Index("ix_findings_case_kind", "case_id", "kind"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"))
    exhibit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("exhibits.id", ondelete="CASCADE"))
    media_file_id: Mapped[Optional[int]] = mapped_column(ForeignKey("media_files.id", ondelete="CASCADE"), index=True)
    kind: Mapped[FindingKind] = mapped_column(_enum(FindingKind, "finding_kind"))
    camera_label: Mapped[str] = mapped_column(String(64), default="")
    start_time: Mapped[Optional[datetime]] = mapped_column(DateTime)
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime)
    media_offset_start: Mapped[Optional[float]] = mapped_column(Float)
    media_offset_end: Mapped[Optional[float]] = mapped_column(Float)
    score: Mapped[Optional[float]] = mapped_column(Float)
    description: Mapped[str] = mapped_column(Text, default="")
    review_status: Mapped[ReviewStatus] = mapped_column(_enum(ReviewStatus, "review_status"), default=ReviewStatus.candidate)
    reviewed_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---------------------------------------------------------------- jobs
class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        Index("ix_jobs_status_created", "status", "created_at"),
        Index("ix_jobs_exhibit_status", "exhibit_id", "status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    workflow: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(255))
    status: Mapped[JobStatus] = mapped_column(_enum(JobStatus, "job_status"), default=JobStatus.queued)
    case_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cases.id", ondelete="SET NULL"), index=True)
    exhibit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("exhibits.id", ondelete="SET NULL"))
    camera_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cameras.id", ondelete="SET NULL"))
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    result: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    current_step: Mapped[str] = mapped_column(String(128), default="")
    error: Mapped[str] = mapped_column(Text, default="")
    exclusive: Mapped[bool] = mapped_column(Boolean, default=True)
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    executor: Mapped[str] = mapped_column(String(32), default="local_worker")
    agent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"))
    worker_id: Mapped[str] = mapped_column(String(128), default="")
    lease_until: Mapped[Optional[datetime]] = mapped_column(DateTime)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    is_simulation: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    steps: Mapped[list["JobStep"]] = relationship(back_populates="job", order_by="JobStep.order",
                                                  cascade="all, delete-orphan")
    created_by: Mapped[Optional[User]] = relationship(foreign_keys=[created_by_id], lazy="joined")


class JobStep(Base):
    __tablename__ = "job_steps"
    __table_args__ = (UniqueConstraint("job_id", "order", name="uq_job_step_order"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    order: Mapped[int] = mapped_column(Integer)
    key: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(128))
    depends_on: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[StepStatus] = mapped_column(_enum(StepStatus, "step_status"), default=StepStatus.pending)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=2)
    message: Mapped[str] = mapped_column(Text, default="")
    error: Mapped[str] = mapped_column(Text, default="")
    tool_versions: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    job: Mapped[Job] = relationship(back_populates="steps")


class JobLog(Base):
    __tablename__ = "job_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    step_key: Mapped[str] = mapped_column(String(64), default="")
    level: Mapped[str] = mapped_column(String(16), default="info")
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---------------------------------------------------------------- reports
class Report(Base):
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    status: Mapped[ReportStatus] = mapped_column(_enum(ReportStatus, "report_status"), default=ReportStatus.draft)
    current_revision: Mapped[int] = mapped_column(Integer, default=0)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    approved_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    revisions: Mapped[list["ReportRevision"]] = relationship(back_populates="report", order_by="ReportRevision.revision",
                                                             cascade="all, delete-orphan")


class ReportRevision(Base):
    __tablename__ = "report_revisions"
    __table_args__ = (UniqueConstraint("report_id", "revision", name="uq_report_revision"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    content: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    pdf_path: Mapped[str] = mapped_column(String(1024), default="")
    docx_path: Mapped[str] = mapped_column(String(1024), default="")
    pdf_sha256: Mapped[str] = mapped_column(String(64), default="")
    docx_sha256: Mapped[str] = mapped_column(String(64), default="")
    change_note: Mapped[str] = mapped_column(String(500), default="")
    job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"))
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    report: Mapped[Report] = relationship(back_populates="revisions")


class Approval(Base):
    __tablename__ = "approvals"
    __table_args__ = (Index("ix_approvals_entity", "entity_type", "entity_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[int] = mapped_column(Integer)
    revision: Mapped[Optional[int]] = mapped_column(Integer)
    decision: Mapped[Decision] = mapped_column(_enum(Decision, "decision"))
    comment: Mapped[str] = mapped_column(Text, default="")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User] = relationship(lazy="joined")


# ---------------------------------------------------------------- audit / notifications
class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_entity", "entity_type", "entity_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    actor: Mapped[str] = mapped_column(String(128), default="system")
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str] = mapped_column(String(32), default="")
    entity_id: Mapped[Optional[int]] = mapped_column(Integer)
    summary: Mapped[str] = mapped_column(String(500), default="")
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    ip: Mapped[str] = mapped_column(String(64), default="")
    prev_hash: Mapped[str] = mapped_column(String(64), default="")
    hash: Mapped[str] = mapped_column(String(64), default="")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_read", "user_id", "read"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    level: Mapped[NotificationLevel] = mapped_column(_enum(NotificationLevel, "notification_level"),
                                                     default=NotificationLevel.info)
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str] = mapped_column(String(255), default="")
    job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"))
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


# ---------------------------------------------------------------- agents / settings
class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    kind: Mapped[AgentKind] = mapped_column(_enum(AgentKind, "agent_kind"), default=AgentKind.remote_agent)
    agent_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    secret_hash: Mapped[str] = mapped_column(String(128), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    allowed_job_types: Mapped[list[str]] = mapped_column(JSON, default=list)
    allowed_roots: Mapped[list[str]] = mapped_column(JSON, default=list)
    host: Mapped[str] = mapped_column(String(128), default="")
    version: Mapped[str] = mapped_column(String(32), default="")
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_ip: Mapped[str] = mapped_column(String(64), default="")
    registered_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AgentNonce(Base):
    __tablename__ = "agent_nonces"
    __table_args__ = (UniqueConstraint("agent_id", "nonce", name="uq_agent_nonce"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    nonce: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AuthorizedRoot(Base):
    __tablename__ = "authorized_roots"
    __table_args__ = (UniqueConstraint("path", "kind", name="uq_root_path_kind"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    path: Mapped[str] = mapped_column(String(1024))
    kind: Mapped[RootKind] = mapped_column(_enum(RootKind, "root_kind"), default=RootKind.source)
    label: Mapped[str] = mapped_column(String(200), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SystemSetting(Base):
    __tablename__ = "system_settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)
    description: Mapped[str] = mapped_column(String(255), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    updated_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
