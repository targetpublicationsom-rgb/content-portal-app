import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import sqlite3 from 'sqlite3'
import type { QCRecord, QCStatus, QCStats, QCFilters } from '../../shared/qc.types'
import { v4 as uuidv4 } from 'uuid'
import { getDatabasePath } from './qcConfig'

let db: sqlite3.Database | null = null

// Helper functions for async database operations
function runAsync(
  sql: string,
  params: unknown[] = []
): Promise<{ lastID: number; changes: number }> {
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
        // Use WAL mode for better concurrent read access during writes
        await runAsync('PRAGMA journal_mode = WAL')
        // Set long busy timeout for concurrent access (30 seconds)
        await runAsync('PRAGMA busy_timeout = 30000')
        // Allow reading uncommitted data for better concurrency
        await runAsync('PRAGMA read_uncommitted = 1')
        // Synchronous = NORMAL for better performance
        await runAsync('PRAGMA synchronous = NORMAL')

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
            processed_by TEXT,
            folder_path TEXT,
            chapter_name TEXT,
            file_type TEXT,
            source_files TEXT,
            batch_id TEXT,
            original_batch_id TEXT,
            batch_submission_order INTEGER
          )
        `

        await execAsync(createTableSQL)

        // Create qc_batches table
        const createBatchesTableSQL = `
          CREATE TABLE IF NOT EXISTS qc_batches (
            batch_id TEXT PRIMARY KEY,
            zip_path TEXT NOT NULL,
            file_count INTEGER NOT NULL,
            zip_size_bytes INTEGER,
            created_at TEXT NOT NULL,
            submitted_at TEXT,
            completed_at TEXT,
            status TEXT NOT NULL,
            completed_count INTEGER DEFAULT 0,
            failed_count INTEGER DEFAULT 0,
            processing_count INTEGER DEFAULT 0
          )
        `

        await execAsync(createBatchesTableSQL)

        // Create qc_batch_history table
        const createBatchHistoryTableSQL = `
          CREATE TABLE IF NOT EXISTS qc_batch_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            qc_id TEXT NOT NULL,
            batch_id TEXT NOT NULL,
            external_qc_id TEXT,
            attempt_number INTEGER NOT NULL,
            status TEXT NOT NULL,
            submitted_at TEXT NOT NULL,
            completed_at TEXT,
            error_message TEXT,
            FOREIGN KEY (qc_id) REFERENCES qc_records(qc_id)
          )
        `

        await execAsync(createBatchHistoryTableSQL)

        // Create indexes for qc_records
        await execAsync('CREATE INDEX IF NOT EXISTS idx_status ON qc_records(status)')
        await execAsync('CREATE INDEX IF NOT EXISTS idx_submitted_at ON qc_records(submitted_at)')
        await execAsync(
          'CREATE INDEX IF NOT EXISTS idx_external_qc_id ON qc_records(external_qc_id)'
        )
        await execAsync('CREATE INDEX IF NOT EXISTS idx_file_path ON qc_records(file_path)')
        await execAsync('CREATE INDEX IF NOT EXISTS idx_folder_path ON qc_records(folder_path)')
        await execAsync(
          'CREATE INDEX IF NOT EXISTS idx_folder_chapter ON qc_records(folder_path, chapter_name, file_type)'
        )
        await execAsync('CREATE INDEX IF NOT EXISTS idx_batch_id ON qc_records(batch_id)')
        await execAsync('CREATE INDEX IF NOT EXISTS idx_original_batch_id ON qc_records(original_batch_id)')

        // Create indexes for qc_batches
        await execAsync('CREATE INDEX IF NOT EXISTS idx_batch_status ON qc_batches(status)')
        await execAsync('CREATE INDEX IF NOT EXISTS idx_batch_submitted_at ON qc_batches(submitted_at)')

        // Create indexes for qc_batch_history
        await execAsync('CREATE INDEX IF NOT EXISTS idx_history_qc_id ON qc_batch_history(qc_id)')
        await execAsync('CREATE INDEX IF NOT EXISTS idx_history_batch_id ON qc_batch_history(batch_id)')

        console.log('[QCStateManager] Database initialized')
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })
}

// Create a new QC record
export async function createQCRecord(
  filePath: string,
  folderPath?: string,
  chapterName?: string,
  fileType?: 'theory' | 'mcqs-solution' | 'merged-mcqs-solution' | 'single-file',
  sourceFiles?: string[]
): Promise<QCRecord> {
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
    processed_by: processedBy,
    folder_path: folderPath || null,
    chapter_name: chapterName || null,
    file_type: fileType || 'single-file',
    source_files: sourceFiles ? JSON.stringify(sourceFiles) : null,
    batch_id: null,
    original_batch_id: null,
    batch_submission_order: null
  }

  await runAsync(
    `
    INSERT INTO qc_records (
      qc_id, file_path, original_name, pdf_path, status, submitted_at,
      completed_at, report_md_path, report_docx_path, qc_score, issues_found,
      issues_low, issues_medium, issues_high,
      external_qc_id, error_message, retry_count, processed_by,
      folder_path, chapter_name, file_type, source_files,
      batch_id, original_batch_id, batch_submission_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      record.processed_by,
      record.folder_path,
      record.chapter_name,
      record.file_type,
      record.source_files,
      record.batch_id,
      record.original_batch_id,
      record.batch_submission_order
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

  await runAsync('UPDATE qc_records SET external_qc_id = ? WHERE qc_id = ?', [externalQcId, qcId])
}

// Update QC record with report data
export async function updateQCReport(
  qcId: string,
  reportMdPath: string,
  reportDocxPath: string | null,
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
    [reportMdPath, reportDocxPath, qcScore, issuesFound, issuesLow, issuesMedium, issuesHigh, qcId]
  )
  console.log(
    `[QCStateManager] Updated ${qcId} with report data (Issues: ${issuesFound}, Low: ${issuesLow}, Med: ${issuesMedium}, High: ${issuesHigh})`
  )
}

// Update QC record with partial data
export async function updateQCRecord(qcId: string, updates: Partial<QCRecord>): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  const allowedFields = [
    'status',
    'error_message',
    'retry_count',
    'completed_at',
    'file_path',
    'original_name'
  ]
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

  if (filters?.filename) {
    sql += ' AND original_name LIKE ?'
    params.push(`%${filters.filename}%`)
  }

  if (filters?.hasIssues !== undefined) {
    if (filters.hasIssues) {
      sql += ' AND issues_found > 0'
    } else {
      sql += ' AND (issues_found IS NULL OR issues_found = 0)'
    }
  }

  // Order by: active jobs first (PROCESSING, CONVERTING, SUBMITTING), then by submission time
  sql += ` ORDER BY 
    CASE WHEN status IN ('PROCESSING', 'CONVERTING', 'SUBMITTING') THEN 0 ELSE 1 END,
    submitted_at DESC 
    LIMIT ? OFFSET ?`
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
    if (status === 'queued' || status === 'validating' || status === 'merging') statusCounts.queued += row.count
    else if (status === 'converting' || status === 'submitting' || status === 'converted')
      statusCounts.converting += row.count
    else if (status === 'processing' || status === 'downloading' || status === 'pending_verification')
      statusCounts.processing += row.count
    else if (status === 'completed') statusCounts.completed = row.count
    else if (status === 'failed' || status === 'numbering_failed' || status === 'conversion_failed') statusCounts.failed += row.count
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

// Get records in CONVERTED state (PDFs ready for batch submission)
// Only returns records that haven't been added to a batch yet (batch_id IS NULL)
export async function getConvertedRecords(): Promise<QCRecord[]> {
  if (!db) throw new Error('Database not initialized')

  const rows = await allAsync(`
    SELECT * FROM qc_records 
    WHERE status = 'CONVERTED' AND batch_id IS NULL
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

// Get most recent record by folder path and file type (for folder-based duplicate detection)
export async function getRecordByFolderAndType(
  folderPath: string,
  fileType: string
): Promise<QCRecord | null> {
  if (!db) throw new Error('Database not initialized')

  const record = await getAsync(
    'SELECT * FROM qc_records WHERE folder_path = ? AND file_type = ? ORDER BY submitted_at DESC LIMIT 1',
    [folderPath, fileType]
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

// ===== BATCH MANAGEMENT FUNCTIONS =====

import type { QCBatch, BatchStatus } from '../../shared/qc.types'

// Create a new batch record
export async function createBatchRecord(
  batchId: string,
  zipPath: string,
  fileCount: number,
  zipSizeBytes?: number
): Promise<QCBatch> {
  if (!db) throw new Error('Database not initialized')

  const batch: QCBatch = {
    batch_id: batchId,
    zip_path: zipPath,
    file_count: fileCount,
    zip_size_bytes: zipSizeBytes || null,
    created_at: new Date().toISOString(),
    submitted_at: null,
    completed_at: null,
    status: 'PENDING',
    completed_count: 0,
    failed_count: 0,
    processing_count: 0
  }

  await runAsync(
    `INSERT INTO qc_batches (
      batch_id, zip_path, file_count, zip_size_bytes, created_at, submitted_at,
      completed_at, status, completed_count, failed_count, processing_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      batch.batch_id,
      batch.zip_path,
      batch.file_count,
      batch.zip_size_bytes,
      batch.created_at,
      batch.submitted_at,
      batch.completed_at,
      batch.status,
      batch.completed_count,
      batch.failed_count,
      batch.processing_count
    ]
  )

  console.log(`[QCStateManager] Created batch record: ${batchId} with ${fileCount} files`)
  return batch
}

// Update batch status
export async function updateBatchStatus(
  batchId: string,
  status: BatchStatus,
  completedCount?: number,
  failedCount?: number,
  processingCount?: number
): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  const updates: string[] = ['status = ?']
  const values: unknown[] = [status]

  if (completedCount !== undefined) {
    updates.push('completed_count = ?')
    values.push(completedCount)
  }

  if (failedCount !== undefined) {
    updates.push('failed_count = ?')
    values.push(failedCount)
  }

  if (processingCount !== undefined) {
    updates.push('processing_count = ?')
    values.push(processingCount)
  }

  if (status === 'SUBMITTED' && updates.indexOf('submitted_at') === -1) {
    updates.push('submitted_at = ?')
    values.push(new Date().toISOString())
  }

  if ((status === 'COMPLETED' || status === 'PARTIAL_COMPLETE' || status === 'FAILED') && updates.indexOf('completed_at') === -1) {
    updates.push('completed_at = ?')
    values.push(new Date().toISOString())
  }

  values.push(batchId)

  await runAsync(
    `UPDATE qc_batches SET ${updates.join(', ')} WHERE batch_id = ?`,
    values
  )

  console.log(`[QCStateManager] Updated batch ${batchId} status to ${status}`)
}

// Update multiple QC records with batch information
export async function updateBatchRecords(
  batchId: string,
  jobMappings: Array<{ qcId: string; jobId: string; order: number }>
): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  for (const mapping of jobMappings) {
    await runAsync(
      `UPDATE qc_records SET 
        batch_id = ?,
        external_qc_id = ?,
        batch_submission_order = ?,
        original_batch_id = COALESCE(original_batch_id, ?)
       WHERE qc_id = ?`,
      [batchId, mapping.jobId, mapping.order, batchId, mapping.qcId]
    )
  }

  console.log(`[QCStateManager] Updated ${jobMappings.length} records with batch ${batchId}`)
}

// Get all records in a batch
export async function getRecordsByBatchId(batchId: string): Promise<QCRecord[]> {
  if (!db) throw new Error('Database not initialized')

  const records = await allAsync(
    'SELECT * FROM qc_records WHERE batch_id = ? ORDER BY batch_submission_order',
    [batchId]
  )

  return records as QCRecord[]
}

// Get QC record by external job ID
export async function getQCRecordByExternalId(externalQcId: string): Promise<QCRecord | null> {
  if (!db) throw new Error('Database not initialized')

  const record = await getAsync(
    'SELECT * FROM qc_records WHERE external_qc_id = ?',
    [externalQcId]
  )

  return (record as QCRecord) || null
}

// Record batch attempt in history
export async function recordBatchHistory(
  qcId: string,
  batchId: string,
  externalQcId: string | null,
  attemptNumber: number,
  status: QCStatus
): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  await runAsync(
    `INSERT INTO qc_batch_history (
      qc_id, batch_id, external_qc_id, attempt_number, status, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [qcId, batchId, externalQcId, attemptNumber, status, new Date().toISOString()]
  )

  console.log(`[QCStateManager] Recorded batch history for ${qcId} in batch ${batchId}`)
}

// Update batch history completion
export async function updateBatchHistory(
  qcId: string,
  batchId: string,
  status: QCStatus,
  errorMessage?: string
): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  await runAsync(
    `UPDATE qc_batch_history SET 
      status = ?,
      completed_at = ?,
      error_message = ?
     WHERE qc_id = ? AND batch_id = ?`,
    [status, new Date().toISOString(), errorMessage || null, qcId, batchId]
  )
}

// Get batch statistics
export async function getBatchStats(batchId: string): Promise<{
  total: number
  completed: number
  failed: number
  processing: number
  queued: number
}> {
  if (!db) throw new Error('Database not initialized')

  const stats = await getAsync(
    `SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status IN ('FAILED', 'CONVERSION_FAILED', 'NUMBERING_FAILED') THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status IN ('PROCESSING', 'SUBMITTING', 'DOWNLOADING', 'PENDING_VERIFICATION') THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status IN ('QUEUED', 'VALIDATING', 'MERGING', 'CONVERTING', 'CONVERTED') THEN 1 ELSE 0 END) as queued
     FROM qc_records 
     WHERE batch_id = ?`,
    [batchId]
  )

  return (stats as any) || { total: 0, completed: 0, failed: 0, processing: 0, queued: 0 }
}

// Get all batches with status
export async function getQCBatches(statusFilter?: BatchStatus[]): Promise<QCBatch[]> {
  if (!db) throw new Error('Database not initialized')

  let query = 'SELECT * FROM qc_batches'
  const params: unknown[] = []

  if (statusFilter && statusFilter.length > 0) {
    const placeholders = statusFilter.map(() => '?').join(',')
    query += ` WHERE status IN (${placeholders})`
    params.push(...statusFilter)
  }

  query += ' ORDER BY created_at DESC'

  const batches = await allAsync(query, params)
  return batches as QCBatch[]
}

// Get batch by ID
export async function getQCBatch(batchId: string): Promise<QCBatch | null> {
  if (!db) throw new Error('Database not initialized')

  const batch = await getAsync(
    'SELECT * FROM qc_batches WHERE batch_id = ?',
    [batchId]
  )

  return (batch as QCBatch) || null
}

// Get processing batches (batches that need polling)
export async function getProcessingBatches(): Promise<QCBatch[]> {
  return getQCBatches(['SUBMITTED', 'PROCESSING'])
}
