export type ProjectStatus = 'awaiting_upload' | 'queued' | 'processing' | 'ready' | 'failed' | 'expired'

export interface Project {
  id: string
  title: string
  status: ProjectStatus
  language: string | null
  error_code: string | null
  /** incremented on every saved edit; used to detect conflicting edits */
  lyrics_version?: number
  /** subtitle style (see subtitleStyle.ts); free-form JSON in the database */
  style?: unknown
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

export interface ExportJob {
  id: string
  project_id: string
  format: 'srt' | 'lrc' | 'ass' | 'mp4'
  options: { aspect?: '16:9' | '9:16' | '1:1'; resolution?: number }
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  progress: number
  output_path: string | null
  error_code: string | null
  created_at: string
  finished_at: string | null
}

export interface Limits {
  max_upload_bytes: number
  max_audio_duration_seconds: number
  allowed_extensions: string[]
  max_uploads_per_day: number
}
