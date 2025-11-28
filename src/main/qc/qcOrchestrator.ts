import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import * as fs from 'fs/promises'
import { WorkerPool } from './WorkerPool'
import type { WorkerMessage } from './workers/types'
import { getQCWatcher, startQCWatcher, stopQCWatcher } from './qcWatcher'
import { getQCExternalService, configureQCExternalService } from './qcExternalService'
import { initializeQCConfig, getConfig, getQCOutputPaths, getLockBasePath } from './qcConfig'
import {
  initializeQCDatabase,
  createQCRecord,
  updateQCStatus,
  updateQCPdfPath,
  updateQCExternalId,
  updateQCReport,
  getProcessingRecords,
  getRecordByFilePath,
  getQCRecord,
  updateQCRecord,
  closeQCDatabase,
  reinitializeQCDatabase
} from './qcStateManager'
import {
  initializeQCNotifications,
  notifyQCCompleted,
  notifyQCFailed,
  notifyServiceOffline
} from './qcNotifications'
import { acquireLock, releaseLock, checkLock, cleanStaleLocks } from './qcLockManager'
import type { WatchEvent } from './qcWatcher'
import type { QCRecord } from '../../shared/qc.types'

class QCOrchestrator extends EventEmitter {
  private isInitialized = false
  private pollingInterval: NodeJS.Timeout | null = null
  private mainWindow: BrowserWindow | null = null
  private jobQueue: Array<{
    filePath: string
    filename: string
    isRetry?: boolean
    recordId?: string | null
  }> = []
  private activeJobs = 0
  private readonly MAX_CONCURRENT_JOBS = 1
  private isProcessingQueue = false
  private workerPool: WorkerPool | null = null
  private processingFiles: Set<string> = new Set() // Track files currently being processed

  async initialize(mainWindow: BrowserWindow): Promise<void> {
    if (this.isInitialized) {
      console.log('[QCOrchestrator] Already initialized')
      return
    }

    this.mainWindow = mainWindow
    console.log('[QCOrchestrator] Initializing...')

    try {
      // Initialize config FIRST (needed for database path)
      initializeQCConfig()

      // Initialize all modules
      await initializeQCDatabase()
      initializeQCNotifications(mainWindow)

      // Initialize worker pool for heavy operations
      this.workerPool = new WorkerPool()
      await this.workerPool.initialize()

      // Setup worker pool event listeners
      this.workerPool.on('progress', ({ response }) => {
        // Forward progress events to renderer
        this.emitToRenderer('qc:conversion-progress', response.data)
      })

      this.workerPool.on('worker-error', ({ workerId, type, error }) => {
        console.error(`[QCOrchestrator] Worker ${workerId} (${type}) error:`, error)
      })

      // Setup event listeners
      this.setupWatcherEvents()

      // Configure external service if API settings exist
      const config = getConfig()
      if (config.apiUrl && config.apiKey) {
        configureQCExternalService(config.apiUrl, config.apiKey)
      }

      // Start polling for processing records
      this.startStatusPolling()

      // Auto-start watcher if watch folders are configured
      if (config.watchFolders && config.watchFolders.length > 0) {
        startQCWatcher(config.watchFolders)
        console.log('[QCOrchestrator] Watcher auto-started with configured folders')
      } else {
        console.log('[QCOrchestrator] No watch folders configured - watcher will start manually')
      }

      this.isInitialized = true
      console.log('[QCOrchestrator] Initialized successfully')
    } catch (error) {
      console.error('[QCOrchestrator] Initialization failed:', error)
      throw error
    }
  }

  async shutdown(): Promise<void> {
    console.log('[QCOrchestrator] Shutting down...')

    // Stop polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }

    // Stop watcher
    stopQCWatcher()

    // Shutdown worker pool
    if (this.workerPool) {
      await this.workerPool.shutdown()
      this.workerPool = null
    }

    // Close database
    await closeQCDatabase()

    this.isInitialized = false
    console.log('[QCOrchestrator] Shutdown complete')
  }

  private setupWatcherEvents(): void {
    const watcher = getQCWatcher()

    watcher.on('file-detected', async (event: WatchEvent) => {
      console.log(`[QCOrchestrator] File detected: ${event.filename}`)
      await this.enqueueJob(event.filePath, event.filename)
    })

    watcher.on('error', (error: string) => {
      console.error('[QCOrchestrator] Watcher error:', error)
      this.emitToRenderer('qc:error', { message: error })
    })
  }

  private async enqueueJob(filePath: string, filename: string, isRetry = false): Promise<void> {
    // Check if this file is already being processed (in queue or active)
    if (this.processingFiles.has(filePath) && !isRetry) {
      console.log(`[QCOrchestrator] File already queued/processing, skipping: ${filename}`)
      return
    }
    
    // Create database record immediately with QUEUED status so it's visible in UI
    let recordId: string | null = null
    
    if (!isRetry) {
      // Check if record already exists
      const existingRecord = await getRecordByFilePath(filePath)
      if (!existingRecord) {
        // Create new record with QUEUED status
        const record = await createQCRecord(filePath)
        recordId = record.qc_id
        await updateQCStatus(record.qc_id, 'QUEUED')
        
        // Emit to renderer so UI updates immediately
        this.emitToRenderer('qc:file-detected', { record })
      } else {
        // Use existing record
        recordId = existingRecord.qc_id
        
        // Skip if already completed or currently processing
        if (existingRecord.status === 'COMPLETED') {
          console.log(`[QCOrchestrator] Skipping - already completed: ${filename}`)
          return
        }
        if (['CONVERTING', 'SUBMITTING', 'PROCESSING', 'DOWNLOADING', 'CONVERTING_REPORT'].includes(existingRecord.status)) {
          console.log(`[QCOrchestrator] Skipping - already ${existingRecord.status}: ${filename}`)
          return
        }
        
        // For FAILED or QUEUED records, update status back to QUEUED for retry
        if (existingRecord.status === 'FAILED') {
          await updateQCStatus(recordId, 'QUEUED')
        }
      }
    }
    
    // Add to processing set
    this.processingFiles.add(filePath)
    
    this.jobQueue.push({ filePath, filename, isRetry, recordId })
    console.log(
      `[QCOrchestrator] Job queued: ${filename} (Queue: ${this.jobQueue.length}, Active: ${this.activeJobs}/${this.MAX_CONCURRENT_JOBS})`
    )

    this.emitToRenderer('qc:queue-status', {
      queueLength: this.jobQueue.length,
      activeJobs: this.activeJobs,
      maxConcurrent: this.MAX_CONCURRENT_JOBS
    })

    this.processQueue()
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return
    }

    this.isProcessingQueue = true

    while (this.jobQueue.length > 0 && this.activeJobs < this.MAX_CONCURRENT_JOBS) {
      const job = this.jobQueue.shift()
      if (!job) continue

      this.activeJobs++
      console.log(
        `[QCOrchestrator] Starting job: ${job.filename} (Active: ${this.activeJobs}/${this.MAX_CONCURRENT_JOBS}, Queue: ${this.jobQueue.length})`
      )

      this.emitToRenderer('qc:queue-status', {
        queueLength: this.jobQueue.length,
        activeJobs: this.activeJobs,
        maxConcurrent: this.MAX_CONCURRENT_JOBS
      })

      // Process job without awaiting (parallel execution)
      this.processNewFile(job.filePath, job.filename, job.isRetry, job.recordId).finally(() => {
        this.activeJobs--
        
        // Remove from processing set when job completes
        this.processingFiles.delete(job.filePath)
        
        console.log(
          `[QCOrchestrator] Job completed: ${job.filename} (Active: ${this.activeJobs}/${this.MAX_CONCURRENT_JOBS}, Queue: ${this.jobQueue.length})`
        )

        this.emitToRenderer('qc:queue-status', {
          queueLength: this.jobQueue.length,
          activeJobs: this.activeJobs,
          maxConcurrent: this.MAX_CONCURRENT_JOBS
        })

        // Try to process next job
        this.isProcessingQueue = false
        this.processQueue()
      })
    }

    this.isProcessingQueue = false
  }

  private async processNewFile(filePath: string, filename: string, _isRetry = false, existingRecordId?: string | null): Promise<void> {
    let recordId: string | null = existingRecordId || null
    const lockBasePath = getLockBasePath()

    try {
      // Clean stale locks first
      await cleanStaleLocks(lockBasePath)

      // Check if file is currently locked by another user
      const existingLock = await checkLock(lockBasePath, filePath)
      if (existingLock) {
        console.log(`[QCOrchestrator] File is locked by ${existingLock.processedBy}: ${filename}`)
        if (recordId) {
          await updateQCStatus(recordId, 'FAILED', `File is locked by ${existingLock.processedBy}`)
        }
        return
      }

      // If we have a recordId from queueing, use it
      if (!recordId) {
        // No record from queueing, check if one exists (should always exist from enqueueJob)
        const existingRecord = await getRecordByFilePath(filePath)
        if (existingRecord) {
          recordId = existingRecord.qc_id
        } else {
          // This should never happen - enqueueJob always creates a record
          console.error(`[QCOrchestrator] CRITICAL: No record found for ${filename} - this should not happen!`)
          throw new Error('No database record found - file was not properly queued')
        }
      }

      // Get the record
      const record = await getQCRecord(recordId)
      if (!record) {
        throw new Error('Failed to get QC record')
      }

      // Acquire lock before processing
      const lockResult = await acquireLock(lockBasePath, record.qc_id, filePath)
      if (!lockResult.success) {
        console.log(
          `[QCOrchestrator] Could not acquire lock for ${filename}: ${lockResult.error || 'locked by ' + lockResult.lockedBy}`
        )
        await updateQCStatus(record.qc_id, 'FAILED', lockResult.error || 'File is locked')
        return
      }

      // Get output paths
      const paths = getQCOutputPaths(record.qc_id, filename)

      // Step 1: Convert DOCX to PDF
      await updateQCStatus(record.qc_id, 'CONVERTING')
      this.emitToRenderer('qc:status-update', { qcId: record.qc_id, status: 'CONVERTING' })

      const pdfPath = await this.convertToPdf(filePath, paths.pdfPath)
      await updateQCPdfPath(record.qc_id, pdfPath)

      // Step 2: Submit to external API
      await this.submitToExternalAPI(record.qc_id, pdfPath, filename)

      // Release lock after successful processing
      await releaseLock(lockBasePath, filePath)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[QCOrchestrator] Failed to process file ${filename}:`, error)

      // Release lock on error
      await releaseLock(lockBasePath, filePath)

      // Use the existing record ID, don't create a new one
      if (recordId) {
        await updateQCStatus(recordId, 'FAILED', errorMessage)
        notifyQCFailed(filename, errorMessage)
        this.emitToRenderer('qc:status-update', {
          qcId: recordId,
          status: 'FAILED',
          error: errorMessage
        })
      }
    }
  }

  private async convertToPdf(docxPath: string, pdfPath: string): Promise<string> {
    if (!this.workerPool) {
      throw new Error('Worker pool not initialized')
    }

    const message: WorkerMessage = {
      id: `convert-${Date.now()}`,
      type: 'convert-docx-to-pdf',
      data: { docxPath, pdfPath }
    }

    const response = await this.workerPool.dispatchJob('word', message)
    return (response.data as { pdfPath: string }).pdfPath
  }

  private async submitToExternalAPI(
    qcId: string,
    pdfPath: string,
    filename: string
  ): Promise<void> {
    const service = getQCExternalService()

    if (!service.isConfigured()) {
      throw new Error('External QC service not configured')
    }

    await updateQCStatus(qcId, 'SUBMITTING')
    this.emitToRenderer('qc:status-update', { qcId, status: 'SUBMITTING' })

    const response = await service.submitPdfForQC(pdfPath, filename)
    await updateQCExternalId(qcId, response.job_id)
    await updateQCStatus(qcId, 'PROCESSING')
    this.emitToRenderer('qc:status-update', {
      qcId,
      status: 'PROCESSING',
      externalQcId: response.job_id
    })
  }

  private startStatusPolling(): void {
    const config = getConfig()

    this.pollingInterval = setInterval(async () => {
      await this.pollProcessingRecords()
    }, config.pollingInterval)

    console.log(`[QCOrchestrator] Status polling started (interval: ${config.pollingInterval}ms)`)
  }

  private async pollProcessingRecords(): Promise<void> {
    try {
      const processingRecords = await getProcessingRecords()

      for (const record of processingRecords) {
        await this.checkQCStatus(record)
      }
    } catch (error) {
      console.error('[QCOrchestrator] Error polling records:', error)
    }
  }

  private async checkQCStatus(record: QCRecord): Promise<void> {
    if (!record.external_qc_id) {
      return
    }

    try {
      const service = getQCExternalService()
      const status = await service.getQCStatus(record.external_qc_id)

      if (status.status === 'COMPLETED' && status.result) {
        await this.handleQCComplete(record, status.result)
      } else if (status.status === 'FAILED') {
        await updateQCStatus(record.qc_id, 'FAILED', 'QC processing failed')
        notifyQCFailed(record.original_name, 'QC processing failed')
        this.emitToRenderer('qc:status-update', {
          qcId: record.qc_id,
          status: 'FAILED',
          error: 'QC processing failed'
        })
      }
    } catch (error) {
      console.error(`[QCOrchestrator] Error checking status for ${record.qc_id}:`, error)

      // Check if service is offline
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        notifyServiceOffline()
      }
    }
  }

  private async handleQCComplete(record: QCRecord, reportMarkdown: string): Promise<void> {
    try {
      const paths = getQCOutputPaths(record.qc_id, record.original_name)

      // Save MD report
      await updateQCStatus(record.qc_id, 'DOWNLOADING')
      this.emitToRenderer('qc:status-update', { qcId: record.qc_id, status: 'DOWNLOADING' })

      await fs.writeFile(paths.reportMdPath, reportMarkdown, 'utf-8')

      // Convert MD to DOCX using worker
      await updateQCStatus(record.qc_id, 'CONVERTING_REPORT')
      this.emitToRenderer('qc:status-update', { qcId: record.qc_id, status: 'CONVERTING_REPORT' })

      try {
        if (this.workerPool) {
          const pandocMessage: WorkerMessage = {
            id: `pandoc-${Date.now()}`,
            type: 'convert-md-to-docx',
            data: { mdPath: paths.reportMdPath, docxPath: paths.reportDocxPath }
          }
          await this.workerPool.dispatchJob('pandoc', pandocMessage)
        }
      } catch (pandocError) {
        console.warn('[QCOrchestrator] Pandoc conversion failed:', pandocError)
      }

      // Parse issues count using report parser worker
      let issuesFound = 0
      let issuesLow = 0
      let issuesMedium = 0
      let issuesHigh = 0

      try {
        if (this.workerPool) {
          const parseMessage: WorkerMessage = {
            id: `parse-${Date.now()}`,
            type: 'parse-report',
            data: { reportPath: paths.reportMdPath }
          }
          const parseResponse = await this.workerPool.dispatchJob('reportParser', parseMessage)
          const parsedData = parseResponse.data as {
            issuesFound: number
            issuesLow: number
            issuesMedium: number
            issuesHigh: number
          }
          issuesFound = parsedData.issuesFound
          issuesLow = parsedData.issuesLow
          issuesMedium = parsedData.issuesMedium
          issuesHigh = parsedData.issuesHigh
        }
      } catch (parseError) {
        console.warn('[QCOrchestrator] Could not parse issues from report:', parseError)
      }

      // Update record with report data (no score)
      await updateQCReport(
        record.qc_id,
        paths.reportMdPath,
        paths.reportDocxPath,
        null,
        issuesFound,
        issuesLow,
        issuesMedium,
        issuesHigh
      )

      await updateQCStatus(record.qc_id, 'COMPLETED')
      notifyQCCompleted(record.original_name, null)
      this.emitToRenderer('qc:status-update', {
        qcId: record.qc_id,
        status: 'COMPLETED',
        issuesFound: issuesFound
      })

      console.log(
        `[QCOrchestrator] QC complete for ${record.original_name} (Issues: ${issuesFound})`
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[QCOrchestrator] Error handling QC completion:`, error)
      await updateQCStatus(record.qc_id, 'FAILED', errorMessage)
      notifyQCFailed(record.original_name, errorMessage)
      this.emitToRenderer('qc:status-update', {
        qcId: record.qc_id,
        status: 'FAILED',
        error: errorMessage
      })
    }
  }

  private emitToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  async reconfigureExternalService(apiUrl: string, apiKey: string): Promise<void> {
    configureQCExternalService(apiUrl, apiKey)
    console.log('[QCOrchestrator] External service reconfigured (API settings from .env)')
  }

  async restartWatcher(): Promise<void> {
    stopQCWatcher()

    // Reload config from .env file
    initializeQCConfig()

    // Reinitialize database in case path changed
    await reinitializeQCDatabase()

    const config = getConfig()
    if (config.watchFolders.length > 0) {
      startQCWatcher(config.watchFolders)
      console.log('[QCOrchestrator] Watcher restarted with folders from .env')
    }
  }

  async retryRecord(qcId: string): Promise<void> {
    const record = await getQCRecord(qcId)
    if (!record) {
      throw new Error('Record not found')
    }

    console.log(`[QCOrchestrator] Manually retrying record: ${record.original_name}`)

    // Reset all retry-related fields including timestamp and status in a single update
    await updateQCRecord(qcId, {
      status: 'QUEUED',
      external_qc_id: null,
      error_message: null,
      retry_count: 0,
      submitted_at: new Date().toISOString() // Reset timestamp to avoid stuck detection
    })

    this.emitToRenderer('qc:status-update', { qcId, status: 'QUEUED' })

    // Enqueue the retry job (respects concurrency limits)
    await this.enqueueJob(record.file_path, record.original_name, true)

    // Trigger queue processing immediately
    this.processQueue()
  }
}

// Singleton instance
let orchestratorInstance: QCOrchestrator | null = null

export function getQCOrchestrator(): QCOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new QCOrchestrator()
  }
  return orchestratorInstance
}

export async function initializeQCOrchestrator(mainWindow: BrowserWindow): Promise<void> {
  const orchestrator = getQCOrchestrator()
  await orchestrator.initialize(mainWindow)
}

export async function shutdownQCOrchestrator(): Promise<void> {
  if (orchestratorInstance) {
    await orchestratorInstance.shutdown()
    orchestratorInstance = null
  }
}
