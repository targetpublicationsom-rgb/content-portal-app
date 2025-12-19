/**
 * Shared types for worker thread communication
 */

export type WorkerMessageType =
  | 'init'
  | 'convert-docx-to-pdf'
  | 'convert-md-to-docx'
  | 'merge-docx'
  | 'parse-report'
  | 'db-create'
  | 'db-update'
  | 'db-read'
  | 'db-delete'
  | 'db-query'
  | 'db-stats'
  | 'progress'
  | 'success'
  | 'error'
  | 'ready'

export interface WorkerMessage {
  id: string // Unique message ID for request/response matching
  type: WorkerMessageType
  data?: unknown
}

export interface WorkerResponse {
  id: string // Matches request ID
  type: 'success' | 'error' | 'progress'
  data?: unknown
  error?: {
    message: string
    stack?: string
  }
}

// Word Converter Messages
export interface ConvertDocxToPdfRequest {
  id: string
  type: 'convert-docx-to-pdf'
  data: {
    docxPath: string
    pdfPath: string
  }
}

export interface ConvertDocxToPdfProgress {
  id: string
  type: 'progress'
  data: {
    stage: 'opening' | 'converting' | 'saving' | 'closing'
    progress: number // 0-100
  }
}

export interface ConvertDocxToPdfResponse {
  id: string
  type: 'success'
  data: {
    pdfPath: string
    duration: number
  }
}

// Pandoc Converter Messages
export interface ConvertMdToDocxRequest {
  id: string
  type: 'convert-md-to-docx'
  data: {
    mdPath: string
    docxPath: string
  }
}

export interface ConvertMdToDocxResponse {
  id: string
  type: 'success'
  data: {
    docxPath: string
  }
}

// Report Parser Messages
export interface ParseReportRequest {
  id: string
  type: 'parse-report'
  data: {
    reportPath: string
  }
}

export interface ParseReportResponse {
  id: string
  type: 'success'
  data: {
    issuesFound: number
    issuesLow: number
    issuesMedium: number
    issuesHigh: number
  }
}

// Word Merger Messages
export interface MergeDocxRequest {
  id: string
  type: 'merge-docx'
  data: {
    mcqsPath: string
    solutionPath: string
    outputPath: string
  }
}

export interface MergeDocxResponse {
  id: string
  type: 'success'
  data: {
    mergedPath: string
  }
}

// Database Messages
export interface DbCreateRecordRequest {
  id: string
  type: 'db-create'
  data: {
    qcId: string
    filePath: string
    filename: string
  }
}

export interface DbUpdateRecordRequest {
  id: string
  type: 'db-update'
  data: {
    qcId: string
    updates: Record<string, unknown>
  }
}

export interface DbReadRecordRequest {
  id: string
  type: 'db-read'
  data: {
    qcId?: string
    filePath?: string
  }
}

export interface DbQueryRecordsRequest {
  id: string
  type: 'db-query'
  data: {
    filters?: Record<string, unknown>
    limit?: number
    offset?: number
  }
}

export interface DbStatsRequest {
  id: string
  type: 'db-stats'
}

export interface DbDeleteRecordRequest {
  id: string
  type: 'db-delete'
  data: {
    qcId?: string
    deleteAll?: boolean
  }
}
