import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import sqlite3 from 'sqlite3'
import type { QCRecord, QCStatus, QCStats, QCFilters } from '../../shared/qc.types'
import { v4 as uuidv4 } from 'uuid'
import { getDatabasePath } from './qcConfig'

let db: sqlite3.Database | null = null

// Helper functions for async database operations
function runAsync(sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'))
      return
    }
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

function getAsync(sql: string, params: unknown[] = []): Promise<unknown | undefined> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'))
      return
    }
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

function allAsync(sql: string, params: unknown[] = []): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'))
      return
    }
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows || [])
    })
  })
}

function execAsync(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'))
      return
    }
    db.exec(sql, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}


// Initialize SQLite database
export async function initializeQCDatabase(): Promise<void> {
  const dbPath = getDatabasePath()
  const dbDir = path.dirname(dbPath)

  // Create database directory if it doesn't exist
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  console.log(`[QCStateManager] Initializing database at: ${dbPath}`)

  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, async (err) => {
      if (err) {
        reject(err)
        return
      }

      try {
        // Use DELETE mode instead of WAL for better network drive compatibility
        await runAsync('PRAGMA journal_mode = DELETE')
        // Set busy timeout for concurrent access
        await runAsync('PRAGMA busy_timeout = 5000')

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

        await execAsync(createTableSQL)

        // Create indexes
        await execAsync('CREATE INDEX IF NOT EXISTS idx_status ON qc_records(status)')
        await execAsync('CREATE INDEX IF NOT EXISTS idx_submitted_at ON qc_records(submitted_at)')
        await execAsync('CREATE INDEX IF NOT EXISTS idx_external_qc_id ON qc_records(external_qc_id)')
        await execAsync('CREATE INDEX IF NOT EXISTS idx_file_path ON qc_records(file_path)')

        console.log('[QCStateManager] Database initialized')
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })
}

// Create a new QC record
export async function createQCRecord(filePath: string): Promise<QCRecord> {
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

  await runAsync(
    `
    INSERT INTO qc_records (
      qc_id, file_path, original_name, pdf_path, status, submitted_at,
      completed_at, report_md_path, report_docx_path, qc_score, issues_found,
      issues_low, issues_medium, issues_high,
      external_qc_id, error_message, retry_count, processed_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
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
    ]
  )

  console.log(`[QCStateManager] Created record: ${record.qc_id} for ${record.original_name}`)
  return record
}

// Update QC record status
export async function updateQCStatus(
  qcId: string,
  status: QCStatus,
  errorMessage?: string
): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  const completedAt =
    status === 'COMPLETED' || status === 'FAILED' ? new Date().toISOString() : null

  await runAsync(
    `
    UPDATE qc_records 
    SET status = ?, error_message = ?, completed_at = ?
    WHERE qc_id = ?
  `,
    [status, errorMessage || null, completedAt, qcId]
  )
  console.log(`[QCStateManager] Updated ${qcId} status to ${status}`)
}

// Update QC record with PDF path
export async function updateQCPdfPath(qcId: string, pdfPath: string): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  await runAsync('UPDATE qc_records SET pdf_path = ? WHERE qc_id = ?', [pdfPath, qcId])
}

// Update QC record with external QC ID
export async function updateQCExternalId(qcId: string, externalQcId: string): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  await runAsync('UPDATE qc_records SET external_qc_id = ? WHERE qc_id = ?', [
    externalQcId,
    qcId
  ])
}

// Update QC record with report data
export async function updateQCReport(
  qcId: string,
  reportMdPath: string,
  reportDocxPath: string,
  qcScore: number | null,
  issuesFound: number,
  issuesLow: number,
  issuesMedium: number,
  issuesHigh: number
): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  await runAsync(
    `
    UPDATE qc_records 
    SET report_md_path = ?, report_docx_path = ?, qc_score = ?, issues_found = ?,
        issues_low = ?, issues_medium = ?, issues_high = ?
    WHERE qc_id = ?
  `,
    [
      reportMdPath,
      reportDocxPath,
      qcScore,
      issuesFound,
      issuesLow,
      issuesMedium,
      issuesHigh,
      qcId
    ]
  )
  console.log(
    `[QCStateManager] Updated ${qcId} with report data (Issues: ${issuesFound}, Low: ${issuesLow}, Med: ${issuesMedium}, High: ${issuesHigh})`
  )
}

// Update QC record with partial data
export async function updateQCRecord(
  qcId: string,
  updates: Partial<QCRecord>
): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  const allowedFields = ['error_message', 'retry_count']
  const fields = Object.keys(updates).filter((key) => allowedFields.includes(key))

  if (fields.length === 0) return

  const setClause = fields.map((field) => `${field} = ?`).join(', ')
  const values = fields.map((field) => updates[field as keyof QCRecord])

  await runAsync(`UPDATE qc_records SET ${setClause} WHERE qc_id = ?`, [...values, qcId])
}

// Get a single QC record
export async function getQCRecord(qcId: string): Promise<QCRecord | null> {
  if (!db) throw new Error('Database not initialized')

  const record = await getAsync('SELECT * FROM qc_records WHERE qc_id = ?', [qcId])

  return (record as QCRecord) || null
}

// Get all QC records with filters
export async function getQCRecords(
  filters?: QCFilters,
  limit = 100,
  offset = 0
): Promise<QCRecord[]> {
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

  const rows = await allAsync(sql, params)
  return rows as QCRecord[]
}

// Get QC statistics
export async function getQCStats(): Promise<QCStats> {
  if (!db) throw new Error('Database not initialized')

  const total = (await getAsync('SELECT COUNT(*) as count FROM qc_records')) as {
    count: number
  }

  const byStatus = (await allAsync(
    'SELECT status, COUNT(*) as count FROM qc_records GROUP BY status'
  )) as Array<{ status: string; count: number }>

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
    else if (
      status === 'processing' ||
      status === 'downloading' ||
      status === 'converting_report'
    )
      statusCounts.processing += row.count
    else if (status === 'completed') statusCounts.completed = row.count
    else if (status === 'failed') statusCounts.failed = row.count
  })

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCompleted = (await getAsync(
    "SELECT COUNT(*) as count FROM qc_records WHERE status = 'COMPLETED' AND completed_at >= ?",
    [todayStart.toISOString()]
  )) as { count: number }

  const avgScore = (await getAsync(
    'SELECT AVG(qc_score) as avg FROM qc_records WHERE qc_score IS NOT NULL'
  )) as { avg: number | null }

  const avgTime = (await getAsync(`
    SELECT AVG(
      (julianday(completed_at) - julianday(submitted_at)) * 86400
    ) as avg
    FROM qc_records 
    WHERE completed_at IS NOT NULL
  `)) as { avg: number | null }

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
export async function getProcessingRecords(): Promise<QCRecord[]> {
  if (!db) throw new Error('Database not initialized')

  const rows = await allAsync(`
    SELECT * FROM qc_records 
    WHERE status IN ('PROCESSING', 'DOWNLOADING')
    AND external_qc_id IS NOT NULL
  `)

  return rows as QCRecord[]
}

// Get most recent record by file path (for duplicate detection)
export async function getRecordByFilePath(filePath: string): Promise<QCRecord | null> {
  if (!db) throw new Error('Database not initialized')

  const record = await getAsync(
    'SELECT * FROM qc_records WHERE file_path = ? ORDER BY submitted_at DESC LIMIT 1',
    [filePath]
  )

  return (record as QCRecord) || null
}

// Delete a single QC record
export async function deleteQCRecord(qcId: string): Promise<boolean> {
  if (!db) throw new Error('Database not initialized')

  const result = await runAsync('DELETE FROM qc_records WHERE qc_id = ?', [qcId])

  return result.changes > 0
}

// Delete all QC records
export async function deleteAllQCRecords(): Promise<number> {
  if (!db) throw new Error('Database not initialized')

  const result = await runAsync('DELETE FROM qc_records')

  return result.changes
}

// Close database connection
export async function closeQCDatabase(): Promise<void> {
  if (db) {
    return new Promise((resolve, reject) => {
      db!.close((err) => {
        if (err) reject(err)
        else {
          db = null
          console.log('[QCStateManager] Database closed')
          resolve()
        }
      })
    })
  }
}

// Reinitialize database (used when database path changes)
export async function reinitializeQCDatabase(): Promise<void> {
  console.log('[QCStateManager] Reinitializing database...')
  await closeQCDatabase()
  await initializeQCDatabase()
}
