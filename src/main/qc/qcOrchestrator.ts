import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { validateNumbering } from '../numberingChecker'
import { WorkerPool } from './WorkerPool'
import type { WorkerMessage } from './workers/types'
import { getQCWatcher, startQCWatcher, stopQCWatcher } from './qcWatcher'
import {
  getQCExternalService,
  configureQCExternalService,
  QCStatusResponse
} from './qcExternalService'
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
  getRecordByFolderAndType,
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
    processingKey?: string // Key for processingFiles set (folderPath|fileType or filePath)
  }> = []
  private activeJobs = 0
  private MAX_CONCURRENT_JOBS = 1
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

      // Configure external service from config
      const config = getConfig()
      if (config.apiUrl && config.apiKey) {
        configureQCExternalService(config.apiUrl, config.apiKey)
        console.log('[QCOrchestrator] External QC service configured')
      }

      // Start polling for processing records
      this.startStatusPolling()

      // Note: Watcher will be started manually via qc:start-watcher IPC call
      console.log('[QCOrchestrator] Initialized - watcher will start when user clicks Start Watching')

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

  private ensureFormatFoldersExist(watchFolders: string[]): void {
    for (const watchFolder of watchFolders) {
      // Create .qc folder
      const qcFolder = path.join(watchFolder, '.qc')
      if (!fsSync.existsSync(qcFolder)) {
        fsSync.mkdirSync(qcFolder, { recursive: true })
        console.log(`[QCOrchestrator] Created .qc folder: ${qcFolder}`)
      }

      // Create format folders
      const twoFileFormat = path.join(watchFolder, 'two-file format')
      const threeFileFormat = path.join(watchFolder, 'three-file format')

      if (!fsSync.existsSync(twoFileFormat)) {
        fsSync.mkdirSync(twoFileFormat, { recursive: true })
        console.log(`[QCOrchestrator] Created format folder: ${twoFileFormat}`)
      }

      if (!fsSync.existsSync(threeFileFormat)) {
        fsSync.mkdirSync(threeFileFormat, { recursive: true })
        console.log(`[QCOrchestrator] Created format folder: ${threeFileFormat}`)
      }
    }
  }

  private setupWatcherEvents(): void {
    const watcher = getQCWatcher()

    watcher.on('file-detected', async (event: WatchEvent) => {
      console.log(`[QCOrchestrator] File detected: ${event.filename}`)

      // Check if this is a folder-based event requiring merge
      if (
        event.folderPath &&
        event.relatedFiles?.mcqs &&
        event.relatedFiles?.solution &&
        event.fileType === 'mcqs-solution'
      ) {
        console.log(`[QCOrchestrator] 3-file format detected for: ${event.chapterName}`)
        await this.enqueueJobWithMerge(event)
      } else {
        // Single file or 2-file format (no merge needed)
        await this.enqueueJob(event.filePath, event.filename, false, event)
      }
    })

    watcher.on('error', (error: string) => {
      console.error('[QCOrchestrator] Watcher error:', error)
      this.emitToRenderer('qc:error', { message: error })
    })
  }

  async enqueueJobWithMerge(event: WatchEvent, existingQcId?: string): Promise<void> {
    if (!event.relatedFiles?.mcqs || !event.relatedFiles?.solution || !event.folderPath) {
      console.error('[QCOrchestrator] Invalid merge event - missing files')
      return
    }

    const { mcqs, solution } = event.relatedFiles
    const { folderPath, chapterName, fileType } = event

    // Check if already processed (skip if not a retry)
    if (!existingQcId) {
      const existingRecord = await getRecordByFolderAndType(folderPath, fileType!)
      if (existingRecord && existingRecord.status === 'COMPLETED') {
        console.log(`[QCOrchestrator] Skipping - already completed: ${chapterName} (${fileType})`)
        return
      }
      if (existingRecord && existingRecord.status === 'FAILED') {
        console.log(`[QCOrchestrator] Skipping - FAILED (use retry button to retry): ${chapterName} (${fileType})`)
        return
      }
    }

    try {
      // Step 1: Validate numbering before merge
      console.log(`[QCOrchestrator] Validating numbering for: ${chapterName}`)
      const validationResult = await validateNumbering(mcqs, solution)

      if (validationResult.status !== 'passed') {
        console.log(`[QCOrchestrator] Numbering validation failed for: ${chapterName}`)

        let record: QCRecord
        if (existingQcId) {
          // Retry case - update existing record
          const existingRecord = await getQCRecord(existingQcId)
          if (!existingRecord) {
            throw new Error('Existing record not found for retry')
          }
          record = existingRecord
          console.log(`[QCOrchestrator] Updating existing record for retry: ${existingQcId}`)
        } else {
          // New validation failure - create record
          const sourceFiles = [path.basename(mcqs), path.basename(solution)]
          // Use MCQs file path as the display file (since it represents the merged intent)
          record = await createQCRecord(
            mcqs,
            folderPath,
            chapterName,
            fileType as 'theory' | 'mcqs-solution' | 'merged-mcqs-solution' | 'single-file',
            sourceFiles
          )
          console.log(`[QCOrchestrator] Created new record for validation failure: ${record.qc_id}`)
        }

        // Format validation issues for error message
        const issuesText = validationResult.issues.join('\n')

        await updateQCRecord(record.qc_id, {
          status: 'NUMBERING_FAILED',
          error_message: `Numbering validation failed:\n${issuesText}`,
          completed_at: new Date().toISOString()
        })

        // Get updated record to emit
        const updatedRecord = await getQCRecord(record.qc_id)

        // Emit event to renderer
        this.emitToRenderer('qc:numbering-validation-failed', {
          qcId: record.qc_id,
          chapterName,
          issues: validationResult.issues,
          summary: validationResult.summary
        })

        // Emit status update so UI refreshes
        if (updatedRecord) {
          this.emitToRenderer('qc:status-update', { record: updatedRecord })
        }

        console.log(
          `[QCOrchestrator] NUMBERING_FAILED record ${existingQcId ? 'updated' : 'created'} for: ${chapterName}`
        )
        return
      }

      console.log(`[QCOrchestrator] ✓ Numbering validation passed for: ${chapterName}`)

      // Step 2: Create merged file path in .qc folder
      const qcFolder = path.join(folderPath, '.qc')
      if (!fsSync.existsSync(qcFolder)) {
        fsSync.mkdirSync(qcFolder, { recursive: true })
      }

      const mergedPath = path.join(qcFolder, `${chapterName}_MCQs & Solution_merged.docx`)

      console.log(`[QCOrchestrator] Merging: ${path.basename(mcqs)} + ${path.basename(solution)}`)

      // Invoke word merger worker
      if (!this.workerPool) {
        throw new Error('Worker pool not initialized')
      }

      const mergeMessage: WorkerMessage = {
        id: `merge-${Date.now()}`,
        type: 'merge-docx',
        data: {
          mcqsPath: mcqs,
          solutionPath: solution,
          outputPath: mergedPath
        }
      }

      const mergeResponse = await this.workerPool.dispatchJob('wordMerger', mergeMessage)

      if (mergeResponse.type === 'error') {
        throw new Error(mergeResponse.error?.message || 'Merge failed')
      }

      const mergedFilePath = (mergeResponse.data as { mergedPath: string }).mergedPath
      console.log(`[QCOrchestrator] Merge successful: ${mergedFilePath}`)

      // Now enqueue the merged file for QC processing
      const mergedEvent: WatchEvent = {
        ...event,
        filePath: mergedFilePath,
        filename: path.basename(mergedFilePath)
      }

      if (existingQcId) {
        // Retry case - update existing record with new merged file
        await updateQCRecord(existingQcId, {
          file_path: mergedFilePath,
          original_name: path.basename(mergedFilePath),
          status: 'QUEUED'
        })
        console.log(`[QCOrchestrator] Updated existing record with merged file: ${existingQcId}`)
        await this.enqueueJob(
          mergedFilePath,
          path.basename(mergedFilePath),
          true,
          mergedEvent,
          existingQcId
        )
      } else {
        // Normal flow - create new record
        await this.enqueueJob(mergedFilePath, path.basename(mergedFilePath), false, mergedEvent)
      }
    } catch (error) {
      console.error(`[QCOrchestrator] Merge failed for ${chapterName}:`, error)
      this.emitToRenderer('qc:error', {
        message: `Failed to merge files for ${chapterName}: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
    }
  }

  async enqueueJob(
    filePath: string,
    filename: string,
    isRetry = false,
    event?: WatchEvent,
    existingQcId?: string
  ): Promise<void> {
    // For folder-based files, check by folder+type; for single files, check by path
    const folderPath = event?.folderPath
    const fileType = event?.fileType || 'single-file'

    // Check if this file is already being processed
    const processingKey = folderPath ? `${folderPath}|${fileType}` : filePath
    if (this.processingFiles.has(processingKey) && !isRetry) {
      console.log(`[QCOrchestrator] File already queued/processing, skipping: ${filename}`)
      return
    }

    // Create database record immediately with QUEUED status so it's visible in UI
    let recordId: string | null = null

    if (existingQcId) {
      // Use existing record (retry case for numbering validation)
      const existingRecord = await getQCRecord(existingQcId)
      if (!existingRecord) {
        throw new Error('Existing record not found for processing')
      }
      recordId = existingQcId
      console.log(`[QCOrchestrator] Using existing record for processing: ${existingQcId}`)
    } else if (!isRetry) {
      // Check if record already exists
      const existingRecord = folderPath
        ? await getRecordByFolderAndType(folderPath, fileType)
        : await getRecordByFilePath(filePath)

      if (!existingRecord) {
        // Create new record with folder metadata
        const sourceFiles = event?.relatedFiles
          ? Object.values(event.relatedFiles)
              .filter(Boolean)
              .map((p) => path.basename(p))
          : undefined

        const record = await createQCRecord(
          filePath,
          folderPath,
          event?.chapterName,
          fileType as 'theory' | 'mcqs-solution' | 'merged-mcqs-solution' | 'single-file',
          sourceFiles
        )
        recordId = record.qc_id
        await updateQCStatus(record.qc_id, 'QUEUED')

        // Emit to renderer so UI updates immediately
        this.emitToRenderer('qc:file-detected', { record })
      } else {
        // Use existing record
        recordId = existingRecord.qc_id

        // Skip if already completed, failed, or currently processing
        if (existingRecord.status === 'COMPLETED') {
          console.log(`[QCOrchestrator] Skipping - already completed: ${filename}`)
          return
        }
        if (existingRecord.status === 'FAILED') {
          console.log(`[QCOrchestrator] Skipping - FAILED (use retry button to retry): ${filename}`)
          return
        }
        if (
          ['CONVERTING', 'SUBMITTING', 'PROCESSING', 'DOWNLOADING'].includes(existingRecord.status)
        ) {
          console.log(`[QCOrchestrator] Skipping - already ${existingRecord.status}: ${filename}`)
          return
        }
      }
    }

    // Add to processing set
    this.processingFiles.add(processingKey)

    this.jobQueue.push({ filePath, filename, isRetry, recordId, processingKey })
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

    try {
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

        // Await job completion before processing next (strict serialization)
        try {
          await this.processNewFile(job.filePath, job.filename, job.isRetry, job.recordId)
        } catch (error) {
          console.error(`[QCOrchestrator] Error processing job: ${job.filename}`, error)
        } finally {
          this.activeJobs--
          // Remove from processing set using the stored key
          if (job.processingKey) {
            this.processingFiles.delete(job.processingKey)
          } else {
            this.processingFiles.delete(job.filePath) // Fallback for old jobs
          }

          console.log(
            `[QCOrchestrator] Job completed: ${job.filename} (Active: ${this.activeJobs}/${this.MAX_CONCURRENT_JOBS}, Queue: ${this.jobQueue.length})`
          )

          this.emitToRenderer('qc:queue-status', {
            queueLength: this.jobQueue.length,
            activeJobs: this.activeJobs,
            maxConcurrent: this.MAX_CONCURRENT_JOBS
          })
        }
      }
    } finally {
      this.isProcessingQueue = false
    }
  }

  private async waitForJobCompletion(qcId: string, filename: string): Promise<void> {
    // Wait until the job reaches COMPLETED or FAILED status
    // Polls the database until terminal state is reached
    const maxWaitTime = 15 * 60 * 1000 // 15 minutes max
    const pollInterval = 2000 // 2 seconds
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitTime) {
      const record = await getQCRecord(qcId)
      if (!record) {
        throw new Error('Record disappeared during polling')
      }

      // Terminal states
      if (record.status === 'COMPLETED') {
        console.log(`[QCOrchestrator] Job terminal state COMPLETED: ${filename}`)
        return
      }
      if (record.status === 'FAILED') {
        console.log(`[QCOrchestrator] Job terminal state FAILED: ${filename}`)
        return
      }

      // Not terminal yet, wait before checking again
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }

    throw new Error(`Job did not complete within ${maxWaitTime / 1000}s timeout`)
  }

  private async processNewFile(
    filePath: string,
    filename: string,
    _isRetry = false,
    existingRecordId?: string | null
  ): Promise<void> {
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
          console.error(
            `[QCOrchestrator] CRITICAL: No record found for ${filename} - this should not happen!`
          )
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

      // Step 3: Wait for job to complete (polling reaches terminal state)
      // This keeps the job slot occupied until COMPLETED or FAILED
      await this.waitForJobCompletion(record.qc_id, filename)

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
    const POLLING_INTERVAL = 5000 // 5 seconds

    this.pollingInterval = setInterval(async () => {
      await this.pollProcessingRecords()
    }, POLLING_INTERVAL)

    console.log(`[QCOrchestrator] Status polling started (interval: ${POLLING_INTERVAL}ms)`)
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
        await this.handleQCComplete(record, status)
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

  private async handleQCComplete(record: QCRecord, status: QCStatusResponse): Promise<void> {
    try {
      const reportMarkdown = status.result
      if (!reportMarkdown) {
        throw new Error('No report data in completed status')
      }

      const paths = getQCOutputPaths(record.qc_id, record.original_name)

      // Save MD report
      await updateQCStatus(record.qc_id, 'DOWNLOADING')
      this.emitToRenderer('qc:status-update', { qcId: record.qc_id, status: 'DOWNLOADING' })

      await fs.writeFile(paths.reportMdPath, reportMarkdown, 'utf-8')

      // Get issues count from API response
      const issuesFound = status.issues_count || 0

      // Update record with report data (no score, no DOCX path - conversion on-demand)
      await updateQCReport(
        record.qc_id,
        paths.reportMdPath,
        null, // DOCX path set to null - will be converted on-demand when user clicks button
        null,
        issuesFound,
        0, // issues_low - not provided by API
        0, // issues_medium - not provided by API
        0 // issues_high - not provided by API
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
      this.ensureFormatFoldersExist(config.watchFolders)
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

  setMaxConcurrentJobs(count: number): void {
    if (count < 1) {
      console.warn('[QCOrchestrator] Max concurrent jobs must be at least 1')
      return
    }

    this.MAX_CONCURRENT_JOBS = count
    console.log(`[QCOrchestrator] Max concurrent jobs set to: ${count}`)

    // Trigger queue processing in case we increased the limit and jobs are queued
    this.processQueue()
  }

  getMaxConcurrentJobs(): number {
    return this.MAX_CONCURRENT_JOBS
  }

  getWorkerPool(): WorkerPool | null {
    return this.workerPool
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
