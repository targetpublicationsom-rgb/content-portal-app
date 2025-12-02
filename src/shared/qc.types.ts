// Shared QC types for both main and renderer processes

export type QCStatus =
  | 'QUEUED'
  | 'CONVERTING'
  | 'SUBMITTING'
  | 'PROCESSING'
  | 'DOWNLOADING'
  | 'COMPLETED'
  | 'FAILED'

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
}

export interface QCConfig {
  watchFolders: string[]
  databasePath: string
  apiUrl: string
  apiKey: string
  pollingInterval: number
  autoSubmit: boolean
  maxRetries: number
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
