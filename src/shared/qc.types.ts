// Shared QC types for both main and renderer processes

export type QCStatus =
  | 'QUEUED'
  | 'CONVERTING'
  | 'SUBMITTING'
  | 'PROCESSING'
  | 'DOWNLOADING'
  | 'COMPLETED'
  | 'FAILED'
  | 'NUMBERING_FAILED'

export interface QCRecord {
  qc_id: string
  file_path: string
  original_name: string
  pdf_path: string | null
  status: QCStatus
  submitted_at: string
  completed_at: string | null
  report_md_path: string | null
  report_docx_path: string | null
  qc_score: number | null
  issues_found: number | null
  issues_low: number | null
  issues_medium: number | null
  issues_high: number | null
  external_qc_id: string | null
  error_message: string | null
  retry_count: number
  processed_by: string | null
  // Folder-based processing fields
  folder_path: string | null
  chapter_name: string | null
  file_type: 'theory' | 'mcqs-solution' | 'merged-mcqs-solution' | 'single-file' | null
  source_files: string | null // JSON array of source file names
  // Batch processing fields
  batch_id: string | null
  original_batch_id: string | null
  batch_submission_order: number | null
}

export interface QCConfig {
  watchFolders: string[]
  apiUrl: string
  apiKey: string
  // Batch processing settings
  batchSize?: number
  batchTimeoutSeconds?: number
  minBatchSize?: number
  maxBatchSizeMB?: number
}

export interface QCStats {
  total: number
  queued: number
  converting: number
  processing: number
  completed: number
  failed: number
  todayCompleted: number
  avgScore: number
  avgProcessingTime: number
}

export interface QCFilters {
  status?: QCStatus
  dateFrom?: string
  dateTo?: string
  minScore?: number
  maxScore?: number
  filename?: string
  hasIssues?: boolean
}

export type BatchStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'PARTIAL_COMPLETE'
  | 'COMPLETED'
  | 'FAILED'

export interface QCBatch {
  batch_id: string
  zip_path: string
  file_count: number
  zip_size_bytes: number | null
  created_at: string
  submitted_at: string | null
  completed_at: string | null
  status: BatchStatus
  completed_count: number
  failed_count: number
  processing_count: number
}

export interface QCBatchHistory {
  id: number
  qc_id: string
  batch_id: string
  external_qc_id: string | null
  attempt_number: number
  status: QCStatus
  submitted_at: string
  completed_at: string | null
  error_message: string | null
}

export interface BatchManifest {
  batch_id: string
  submitted_at: string
  file_count: number
  files: {
    [key: string]: {
      original_name: string
      folder: string | null
      file_type: string | null
    }
  }
}

export interface BatchSubmitResponse {
  success: boolean
  batch_id: string
  status: string
  file_count: number
  submitted_at: string
  jobs: Array<{
    qc_id: string
    job_id: string
    filename: string
    original_name: string
    status: string
  }>
  message?: string
}

export interface BatchStatusResponse {
  success: boolean
  batch_id: string
  status: BatchStatus
  file_count: number
  completed_count: number
  failed_count: number
  processing_count: number
  queued_count: number
  success_rate: number
  submitted_at: string
  updated_at: string
  completed_at?: string
  processing_time_seconds?: number
  jobs: Array<{
    job_id: string
    qc_id: string
    filename: string
    original_name: string
    status: string
    started_at?: string
    completed_at?: string
    failed_at?: string
    issues_count?: number
    result?: string
    error?: string
    error_code?: string
    retryable?: boolean
    retry_suggestion?: string
  }>
  summary?: {
    message: string
    failed_files: string[]
  }
}
