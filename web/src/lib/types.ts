export type ProjectStatus = 'awaiting_upload' | 'queued' | 'processing' | 'ready' | 'failed' | 'expired'

export interface Project {
  id: string
  title: string
  status: ProjectStatus
  language: string | null
  error_code: string | null
  created_at: string
  updated_at: string
}

export interface AudioFile {
  id: string
  project_id: string
  storage_path: string
  original_name: string
  size_bytes: number
  duration_ms: number | null
  detected_format: string | null
  status: 'pending' | 'verified' | 'rejected' | 'deleted'
}

export interface ProcessingJob {
  id: string
  project_id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  stage: string
  progress: number
  attempts: number
  max_attempts: number
  error_code: string | null
  created_at: string
}

export interface LyricWord {
  id: string
  line_id: string
  text: string
  start_ms: number
  end_ms: number
  word_index: number
  confidence: number | null
}

export interface LyricLine {
  id: string
  line_index: number
  start_ms: number
  end_ms: number
  words: LyricWord[]
}

export interface Limits {
  max_upload_bytes: number
  max_audio_duration_seconds: number
  allowed_extensions: string[]
  max_uploads_per_day: number
}
