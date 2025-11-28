import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import Database from 'better-sqlite3'
import type { QCRecord, QCStatus, QCStats, QCFilters } from '../../shared/qc.types'
import { v4 as uuidv4 } from 'uuid'
import { getDatabasePath } from './qcConfig'

let db: Database.Database | null = null

// Initialize SQLite database
export function initializeQCDatabase(): void {
  const dbPath = getDatabasePath()
  const dbDir = path.dirname(dbPath)

  // Create database directory if it doesn't exist
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  console.log(`[QCStateManager] Initializing database at: ${dbPath}`)

  db = new Database(dbPath)
  // Use DELETE mode instead of WAL for better network drive compatibility
  db.pragma('journal_mode = DELETE')
  // Set busy timeout for concurrent access
  db.pragma('busy_timeout = 5000')

  // Create tables
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS qc_records (
      qc_id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      original_name TEXT NOT NULL,
      pdf_path TEXT,
      status TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      completed_at TEXT,
      report_md_path TEXT,
      report_docx_path TEXT,
      qc_score REAL,
      issues_found INTEGER,
      issues_low INTEGER,
      issues_medium INTEGER,
      issues_high INTEGER,
      external_qc_id TEXT,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      processed_by TEXT
    )
  `

  db.exec(createTableSQL)

  // Create indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_status ON qc_records(status)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_submitted_at ON qc_records(submitted_at)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_external_qc_id ON qc_records(external_qc_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_file_path ON qc_records(file_path)')

  console.log('[QCStateManager] Database initialized')
}

// Create a new QC record
export function createQCRecord(filePath: string): QCRecord {
  if (!db) throw new Error('Database not initialized')

  const username = os.userInfo().username
  const hostname = os.hostname()
  const processedBy = `${username}@${hostname}`

  const record: QCRecord = {
    qc_id: uuidv4(),
    file_path: filePath,
    original_name: path.basename(filePath),
    pdf_path: null,
    status: 'QUEUED',
    submitted_at: new Date().toISOString(),
    completed_at: null,
    report_md_path: null,
    report_docx_path: null,
    qc_score: null,
    issues_found: null,
    issues_low: null,
    issues_medium: null,
    issues_high: null,
    external_qc_id: null,
    error_message: null,
    retry_count: 0,
    processed_by: processedBy
  }

  const stmt = db.prepare(`
    INSERT INTO qc_records (
      qc_id, file_path, original_name, pdf_path, status, submitted_at,
      completed_at, report_md_path, report_docx_path, qc_score, issues_found,
      issues_low, issues_medium, issues_high,
      external_qc_id, error_message, retry_count, processed_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    record.qc_id,
    record.file_path,
    record.original_name,
    record.pdf_path,
    record.status,
    record.submitted_at,
    record.completed_at,
    record.report_md_path,
    record.report_docx_path,
    record.qc_score,
    record.issues_found,
    record.issues_low,
    record.issues_medium,
    record.issues_high,
    record.external_qc_id,
    record.error_message,
    record.retry_count,
    record.processed_by
  )

  console.log(`[QCStateManager] Created record: ${record.qc_id} for ${record.original_name}`)
  return record
}

// Update QC record status
export function updateQCStatus(qcId: string, status: QCStatus, errorMessage?: string): void {
  if (!db) throw new Error('Database not initialized')

  const stmt = db.prepare(`
    UPDATE qc_records 
    SET status = ?, error_message = ?, completed_at = ?
    WHERE qc_id = ?
  `)

  const completedAt = status === 'COMPLETED' || status === 'FAILED' ? new Date().toISOString() : null

  stmt.run(status, errorMessage || null, completedAt, qcId)
  console.log(`[QCStateManager] Updated ${qcId} status to ${status}`)
}

// Update QC record with PDF path
export function updateQCPdfPath(qcId: string, pdfPath: string): void {
  if (!db) throw new Error('Database not initialized')

  const stmt = db.prepare('UPDATE qc_records SET pdf_path = ? WHERE qc_id = ?')
  stmt.run(pdfPath, qcId)
}

// Update QC record with external QC ID
export function updateQCExternalId(qcId: string, externalQcId: string): void {
  if (!db) throw new Error('Database not initialized')

  const stmt = db.prepare('UPDATE qc_records SET external_qc_id = ? WHERE qc_id = ?')
  stmt.run(externalQcId, qcId)
}

// Update QC record with report data
export function updateQCReport(
  qcId: string,
  reportMdPath: string,
  reportDocxPath: string,
  qcScore: number | null,
  issuesFound: number,
  issuesLow: number,
  issuesMedium: number,
  issuesHigh: number
): void {
  if (!db) throw new Error('Database not initialized')

  const stmt = db.prepare(`
    UPDATE qc_records 
    SET report_md_path = ?, report_docx_path = ?, qc_score = ?, issues_found = ?,
        issues_low = ?, issues_medium = ?, issues_high = ?
    WHERE qc_id = ?
  `)

  stmt.run(reportMdPath, reportDocxPath, qcScore, issuesFound, issuesLow, issuesMedium, issuesHigh, qcId)
  console.log(`[QCStateManager] Updated ${qcId} with report data (Issues: ${issuesFound}, Low: ${issuesLow}, Med: ${issuesMedium}, High: ${issuesHigh})`)
}

// Update QC record with partial data
export function updateQCRecord(qcId: string, updates: Partial<QCRecord>): void {
  if (!db) throw new Error('Database not initialized')

  const allowedFields = ['error_message', 'retry_count']
  const fields = Object.keys(updates).filter(key => allowedFields.includes(key))

  if (fields.length === 0) return

  const setClause = fields.map(field => `${field} = ?`).join(', ')
  const values = fields.map(field => updates[field as keyof QCRecord])

  const stmt = db.prepare(`UPDATE qc_records SET ${setClause} WHERE qc_id = ?`)
  stmt.run(...values, qcId)
}

// Get a single QC record
export function getQCRecord(qcId: string): QCRecord | null {
  if (!db) throw new Error('Database not initialized')

  const stmt = db.prepare('SELECT * FROM qc_records WHERE qc_id = ?')
  const record = stmt.get(qcId) as QCRecord | undefined

  return record || null
}

// Get all QC records with filters
export function getQCRecords(filters?: QCFilters, limit = 100, offset = 0): QCRecord[] {
  if (!db) throw new Error('Database not initialized')

  let sql = 'SELECT * FROM qc_records WHERE 1=1'
  const params: unknown[] = []

  if (filters?.status) {
    sql += ' AND status = ?'
    params.push(filters.status)
  }

  if (filters?.dateFrom) {
    sql += ' AND submitted_at >= ?'
    params.push(filters.dateFrom)
  }

  if (filters?.dateTo) {
    sql += ' AND submitted_at <= ?'
    params.push(filters.dateTo)
  }

  if (filters?.minScore !== undefined) {
    sql += ' AND qc_score >= ?'
    params.push(filters.minScore)
  }

  if (filters?.maxScore !== undefined) {
    sql += ' AND qc_score <= ?'
    params.push(filters.maxScore)
  }

  sql += ' ORDER BY submitted_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const stmt = db.prepare(sql)
  return stmt.all(...params) as QCRecord[]
}

// Get QC statistics
export function getQCStats(): QCStats {
  if (!db) throw new Error('Database not initialized')

  const total = db.prepare('SELECT COUNT(*) as count FROM qc_records').get() as { count: number }

  const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM qc_records GROUP BY status').all() as Array<{ status: string; count: number }>

  const statusCounts = {
    queued: 0,
    converting: 0,
    processing: 0,
    completed: 0,
    failed: 0
  }

  byStatus.forEach((row) => {
    const status = row.status.toLowerCase()
    if (status === 'queued') statusCounts.queued = row.count
    else if (status === 'converting' || status === 'submitting') statusCounts.converting += row.count
    else if (status === 'processing' || status === 'downloading' || status === 'converting_report')
      statusCounts.processing += row.count
    else if (status === 'completed') statusCounts.completed = row.count
    else if (status === 'failed') statusCounts.failed = row.count
  })

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCompleted = db
    .prepare(
      "SELECT COUNT(*) as count FROM qc_records WHERE status = 'COMPLETED' AND completed_at >= ?"
    )
    .get(todayStart.toISOString()) as { count: number }

  const avgScore = db
    .prepare('SELECT AVG(qc_score) as avg FROM qc_records WHERE qc_score IS NOT NULL')
    .get() as { avg: number | null }

  const avgTime = db
    .prepare(`
    SELECT AVG(
      (julianday(completed_at) - julianday(submitted_at)) * 86400
    ) as avg
    FROM qc_records 
    WHERE completed_at IS NOT NULL
  `)
    .get() as { avg: number | null }

  return {
    total: total.count,
    queued: statusCounts.queued,
    converting: statusCounts.converting,
    processing: statusCounts.processing,
    completed: statusCounts.completed,
    failed: statusCounts.failed,
    todayCompleted: todayCompleted.count,
    avgScore: avgScore.avg || 0,
    avgProcessingTime: avgTime.avg || 0
  }
}

// Get records in processing state (for polling)
export function getProcessingRecords(): QCRecord[] {
  if (!db) throw new Error('Database not initialized')

  const stmt = db.prepare(`
    SELECT * FROM qc_records 
    WHERE status IN ('PROCESSING', 'DOWNLOADING')
    AND external_qc_id IS NOT NULL
  `)

  return stmt.all() as QCRecord[]
}

// Get most recent record by file path (for duplicate detection)
export function getRecordByFilePath(filePath: string): QCRecord | null {
  if (!db) throw new Error('Database not initialized')

  const stmt = db.prepare(
    'SELECT * FROM qc_records WHERE file_path = ? ORDER BY submitted_at DESC LIMIT 1'
  )
  const record = stmt.get(filePath) as QCRecord | undefined

  return record || null
}

// Delete a single QC record
export function deleteQCRecord(qcId: string): boolean {
  if (!db) throw new Error('Database not initialized')

  const stmt = db.prepare('DELETE FROM qc_records WHERE qc_id = ?')
  const result = stmt.run(qcId)

  return result.changes > 0
}

// Delete all QC records
export function deleteAllQCRecords(): number {
  if (!db) throw new Error('Database not initialized')

  const stmt = db.prepare('DELETE FROM qc_records')
  const result = stmt.run()

  return result.changes
}

// Close database connection
export function closeQCDatabase(): void {
  if (db) {
    db.close()
    db = null
    console.log('[QCStateManager] Database closed')
  }
}

// Reinitialize database (used when database path changes)
export function reinitializeQCDatabase(): void {
  console.log('[QCStateManager] Reinitializing database...')
  closeQCDatabase()
  initializeQCDatabase()
}
