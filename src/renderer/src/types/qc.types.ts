// QC Module Type Definitions

export type QCStatus =
  | 'QUEUED' // File detected, waiting in conversion queue
  | 'PENDING_METADATA' // Waiting for user to provide Standard/Subject/Chapter metadata (subjective files only)
  | 'VALIDATING' // Checking numbering for MCQs+Solution
  | 'MERGING' // Merging MCQs and Solution files
  | 'CONVERTING' // Converting DOCX to PDF
  | 'CONVERTED' // PDF successfully created, pending batch submission
  | 'CONVERSION_FAILED' // Word to PDF conversion failed
  | 'SUBMITTING' // Uploading PDF to external API
  | 'PENDING_VERIFICATION' // Batch submitted with 504/503 error - verifying backend status
  | 'PROCESSING' // External API running QC
  | 'DOWNLOADING' // Downloading QC report
  | 'COMPLETED' // QC complete, report available
  | 'FAILED' // Process failed at any stage
  | 'NUMBERING_FAILED' // Numbering validation failed before merge

export interface QCRecord {
  qc_id: string // UUID
  file_path: string // Original DOCX path
  original_name: string // Filename
  pdf_path: string | null // Converted PDF path
  status: QCStatus
  submitted_at: string // ISO timestamp
  completed_at: string | null // ISO timestamp
  report_md_path: string | null // MD report path
  report_docx_path: string | null // DOCX report path
  qc_score: number | null // 0-100
  issues_found: number | null
  issues_low: number | null // Low severity issues count
  issues_medium: number | null // Medium severity issues count
  issues_high: number | null // High severity issues count
  external_qc_id: string | null // External API QC ID
  error_message: string | null
  retry_count: number
  processed_by: string | null // username@hostname
  // Folder-based processing fields
  folder_path: string | null
  chapter_name: string | null
  file_type: 'theory' | 'mcqs-solution' | 'merged-mcqs-solution' | 'single-file' | null
  source_files: string | null // JSON array of source file names
}

export interface QCConfig {
  watchFolders: string[]
  databasePath: string
  apiUrl: string
  apiKey: string
  pollingInterval: number // milliseconds
  autoSubmit: boolean
  maxRetries: number
}

export interface QCExternalAPIRequest {
  file: Buffer
  filename: string
  metadata?: Record<string, unknown>
}

export interface QCExternalAPIResponse {
  qc_id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  message?: string
}

export interface QCExternalReportResponse {
  qc_id: string
  score: number
  issues_found: number
  report_md: string // Markdown content
  completed_at: string
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
  avgProcessingTime: number // seconds
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

export interface BatchRetryResult {
  success: boolean
  retriedCount: number
  skippedCount: number
  skippedReasons: string[]
  newBatchId?: string
  maxRetryLimitReached: string[]
}
