// QC Module Type Definitions

export type QCStatus =
  | 'QUEUED' // File detected, waiting in conversion queue
  | 'CONVERTING' // Converting DOCX to PDF
  | 'SUBMITTING' // Uploading PDF to external API
  | 'PROCESSING' // External API running QC
  | 'DOWNLOADING' // Downloading QC report
  | 'CONVERTING_REPORT' // Converting MD to DOCX
  | 'COMPLETED' // QC complete, report available
  | 'FAILED' // Process failed at any stage

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
  external_qc_id: string | null // External API QC ID
  error_message: string | null
  retry_count: number
  processed_by: string | null // username@hostname
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
}
