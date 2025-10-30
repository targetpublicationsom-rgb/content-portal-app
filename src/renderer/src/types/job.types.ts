export interface JobCounts {
  questions: number
  answers: number
  unmatched: number
}

export interface Job {
  job_id: string
  mode: 'single' | 'two-file'
  state: 'DONE' | 'FAILED' | 'RUNNING'
  gate_passed: boolean
  created_at: string
  updated_at: string
  report_url: string | null
  stream_id: number | null
  stream_name: string | null
  standard_id: number | null
  standard_name: string | null
  subject_id: number | null
  subject_name: string | null
  upload_state: 'READY' | 'BLOCKED' | 'UPLOADED'
  upload_receipt_url: string | null
  counts: JobCounts
}

export interface JobsResponse {
  items: Job[]
  next_cursor: string | null
  limit: number
}

export interface Stage {
  name: string
  status: string  // Can be 'ok', 'error', 'running', 'pending', etc.
  started_at?: string
  ended_at?: string
  metrics?: {
    duration_sec: number
  }
  log_path?: string
}

export interface JobDetails {
  job_id: string
  format: 'single' | 'two-file'
  state: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'
  gate_passed: boolean
  gate_report_url: string
  created_at: string
  updated_at: string
  workspace: string
  report_url: string
  stages: Stage[]
  stream_id: number | null
  stream_name: string | null
  standard_id: number | null
  standard_name: string | null
  subject_id: number | null
  subject_name: string | null
}

export interface JobStatus {
  job_id: string
  format: 'single' | 'two-file'
  state: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'
  gate_passed?: boolean
  gate_report_url?: string
  stages: Stage[]
  created_at: string
  updated_at: string
  workspace?: string
  report_url?: string
}
