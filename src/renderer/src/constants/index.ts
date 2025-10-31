// Job states
export const JOB_STATES = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  RUNNING: 'RUNNING'
} as const

// Job modes / file formats
export const FILE_FORMATS = {
  SINGLE: 'single',
  TWO_FILE: 'two-file'
} as const

// Upload states
export const UPLOAD_STATES = {
  READY: 'READY',
  BLOCKED: 'BLOCKED'
} as const

// Stage statuses
export const STAGE_STATUSES = {
  OK: 'ok',
  ERROR: 'error',
  RUNNING: 'running',
  PENDING: 'pending'
} as const

// Default pagination
export const DEFAULT_PAGE_SIZE = 10
export const DEFAULT_LIMIT = 10
