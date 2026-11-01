export type Role = "admin" | "investigator" | "viewer";
export interface User {
  id: number; username: string; full_name: string; role: Role; role_label: string; is_active: boolean;
  is_demo: boolean; last_login_at: string | null;
}
export interface UserBrief { id: number; full_name: string }
export type CaseStatus = "open" | "in_progress" | "pending_review" | "closed" | "archived";
export type Priority = "low" | "medium" | "high" | "critical";
export interface Case {
  id: number; reference: string; title: string; description: string; status: CaseStatus; priority: Priority;
  assigned_to: UserBrief | null; incident_date: string | null; opened_at: string | null; due_date: string | null;
  closed_at: string | null; notes: string; is_demo: boolean; created_at: string; updated_at: string;
  exhibit_count: number; media_count: number; active_jobs: number;
}
export interface Source {
  id: number; exhibit_id: number; kind: string; path: string; label: string; authorization_note: string;
  authorized_at: string | null; last_scanned_at: string | null; file_count: number; total_bytes: number;
}
export interface Exhibit {
  id: number; case_id: number; identifier: string; label: string; description: string; exhibit_type: string;
  source_device: string; location: string; acquisition_method: string; acquired_at: string | null;
  acquired_by: UserBrief | null; storage_reference: string; status: string; created_at: string;
  media_count: number; sources: Source[];
}
export interface Custody {
  id: number; exhibit_id: number; event_type: string; description: string; from_party: string; to_party: string;
  location: string; occurred_at: string; recorded_by: UserBrief | null; job_id: number | null;
}
export interface WorkingCopy {
  id: number; path: string; sha256: string; verified: boolean; verified_at: string | null; has_thumbnail: boolean;
  has_proxy: boolean;
}
export interface Media {
  id: number; case_id: number; exhibit_id: number; source_id: number; relative_path: string; file_name: string;
  extension: string; size_bytes: number; media_type: "video" | "image" | "audio" | "other"; source_mtime: string | null;
  duration_seconds: number | null; width: number | null; height: number | null; codec: string; fps: number | null;
  container: string; camera_label: string; recorded_start: string | null; recorded_end: string | null;
  time_source: string; warnings: string[]; status: string; source_sha256: string | null;
  working_copy: WorkingCopy | null;
}
export interface HashRec {
  id: number; target: string; target_path: string; algorithm: string; value: string; size_bytes: number;
  matches_source: boolean | null; job_id: number | null; computed_at: string;
}
export interface Finding {
  id: number; case_id: number; exhibit_id: number | null; media_file_id: number | null;
  kind: "motion" | "gap" | "time_inconsistency" | "integrity"; camera_label: string; start_time: string | null;
  end_time: string | null; media_offset_start: number | null; media_offset_end: number | null; score: number | null;
  description: string; review_status: "candidate" | "confirmed" | "rejected"; reviewed_at: string | null;
  job_id: number | null;
}
export type JobStatus = "awaiting_approval" | "queued" | "running" | "cancel_requested" | "cancelled" | "succeeded" | "failed";
export interface Job {
  id: number; workflow: string; workflow_name: string; title: string; status: JobStatus; case_id: number | null;
  case_reference: string | null; exhibit_id: number | null; exhibit_identifier: string | null;
  camera_id: number | null; params: Record<string, unknown>; result: Record<string, unknown>; progress: number;
  current_step: string; error: string; requires_approval: boolean; approved_at: string | null; executor: string;
  agent_id: number | null; attempts: number; is_simulation: boolean; created_by: UserBrief | null;
  created_at: string; started_at: string | null; finished_at: string | null; updated_at: string;
}
export interface Step {
  id: number; order: number; key: string; name: string; status: string; progress: number; attempts: number;
  max_retries: number; message: string; error: string; tool_versions: Record<string, string>;
  started_at: string | null; finished_at: string | null;
}
export interface JobLog { id: number; step_key: string; level: string; message: string; created_at: string }
export interface JobDetail extends Job { steps: Step[]; logs: JobLog[] }
export interface Workflow {
  key: string; name: string; description: string; scope: "source" | "exhibit" | "case" | "camera";
  agent_allowed: boolean; steps: { key: string; name: string; depends_on: string[] }[];
}
export interface Channel { id?: number; number: number; name: string; enabled: boolean; resolution: string }
export interface Camera {
  id: number; name: string; vendor: string; model: string; device_type: string; endpoint: string; location: string;
  timezone: string; clock_offset_seconds: number; clock_offset_recorded_at: string | null; adapter: string;
  status: string; authorization_ref: string; authorized_at: string | null; credential_ref: string;
  case_id: number | null; last_test_at: string | null; last_test_result: string; notes: string; channels: Channel[];
  created_at: string;
}
export interface Report {
  id: number; case_id: number; case_reference: string; title: string; status: string; current_revision: number;
  approved_at: string | null; created_at: string; updated_at: string;
}
export interface Revision {
  id: number; revision: number; pdf_sha256: string; docx_sha256: string; change_note: string; job_id: number | null;
  created_by_id: number | null; created_at: string;
}
export interface Approval {
  id: number; entity_type: string; revision: number | null; decision: string; comment: string; user: UserBrief;
  created_at: string;
}
export interface ReportDetail extends Report {
  revisions: Revision[]; approvals: Approval[]; content: Record<string, any>;
}
export interface Notification {
  id: number; level: "info" | "success" | "warning" | "error"; title: string; body: string; link: string;
  read: boolean; job_id: number | null; created_at: string;
}
export interface AuditEvent {
  id: number; created_at: string; actor: string; action: string; entity_type: string; entity_id: number | null;
  summary: string; details: Record<string, unknown>; ip: string; hash: string;
}
export interface Health {
  worker_ok: boolean; worker_last_seen: string | null; db_ok: boolean; db_kind: string; storage_free: number;
  storage_total: number; storage_free_pct: number; ffmpeg: boolean; remote_mode: string; agents_total: number;
  agents_online: number; demo_mode: boolean; tools?: Record<string, string>;
}
export interface Agent {
  id: number; name: string; kind: string; agent_key: string; enabled: boolean; allowed_job_types: string[];
  allowed_roots: string[]; host: string; version: string; last_seen_at: string | null; last_ip: string;
  created_at: string; online: boolean;
}
export interface Dashboard {
  kpis: {
    open_cases: number; cases_attention: number; cameras: number; cameras_online: number; jobs_active: number;
    jobs_awaiting: number; jobs_avg_progress: number; jobs_done_24h: number; jobs_failed_24h: number;
  };
  jobs: Job[]; activity: AuditEvent[]; notifications: Notification[]; unread: number; health: Health;
  preview: null | {
    media_id: number; file_name: string; camera: string; case_reference: string; case_id: number;
    recorded_start: string | null; duration: number; motion: { start: number; end: number; score: number }[];
  };
}
