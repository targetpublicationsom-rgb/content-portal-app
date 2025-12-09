import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { validateNumbering } from '../numberingChecker'
import { WorkerPool } from './WorkerPool'
import { sanitizeYAMLFrontMatter } from './yamlSanitizer'
import type { WorkerMessage } from './workers/types'
import { getQCWatcher, startQCWatcher, stopQCWatcher } from './qcWatcher'
import {
  getQCExternalService,
  configureQCExternalService,
  QCStatusResponse,
  GatewayTimeoutError,
  ServiceUnavailableError,
  BatchSubmissionError
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
  getConvertedRecords,
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
import type { QCRecord, BatchManifest, BatchStatus } from '../../shared/qc.types'
import AdmZip from 'adm-zip'
import { v4 as uuidv4 } from 'uuid'
import {
  createBatchRecord,
  updateBatchStatus,
  updateBatchRecords,
  getProcessingBatches,
  getQCRecordByExternalId,
  recordBatchHistory,
  getRecordsByBatchId
} from './qcStateManager'
import { getBatchZipPath } from './qcConfig'

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
  
  // Batch processing properties
  private convertedPdfBatch: Array<{
    qcId: string
    pdfPath: string
    filename: string
    originalName: string
    folderPath: string | null
    fileType: string | null
  }> = []
  private batchTimeoutTimer: NodeJS.Timeout | null = null
  private isBatchProcessing = false

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
      
      // Recover CONVERTED records from previous session
      // (PDFs that were successfully created but not yet batched when app closed)
      await this.recoverConvertedRecords()
      
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

  private async recoverConvertedRecords(): Promise<void> {
    try {
      console.log('[QCOrchestrator] Recovering CONVERTED records from previous session...')
      
      // Query all CONVERTED records (PDFs successfully created, pending batch submission)
      const convertedRecords = await getConvertedRecords()

      if (convertedRecords.length === 0) {
        console.log('[QCOrchestrator] No CONVERTED records found to recover')
        return
      }

      console.log(`[QCOrchestrator] Recovered ${convertedRecords.length} CONVERTED records`)

      // Add recovered records to batch queue
      for (const record of convertedRecords) {
        if (!record.pdf_path) {
          console.warn(`[QCOrchestrator] Recovered CONVERTED record ${record.qc_id} missing pdf_path, skipping`)
          continue
        }

        console.log(`[QCOrchestrator] Re-queueing for batch: ${record.original_name}`)
        this.convertedPdfBatch.push({
          qcId: record.qc_id,
          pdfPath: record.pdf_path,
          filename: record.original_name,
          originalName: record.original_name,
          folderPath: record.folder_path,
          fileType: record.file_type
        })
      }

      // Start batch timeout for recovery
      if (this.convertedPdfBatch.length > 0) {
        console.log(`[QCOrchestrator] Starting batch timeout for recovered files (${this.convertedPdfBatch.length} files)`)
        this.startBatchTimeout()
      }
    } catch (error) {
      console.error('[QCOrchestrator] Error recovering CONVERTED records:', error)
      // Don't throw - let app continue even if recovery fails
    }
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
      // Step 1: Set VALIDATING status for retry
      if (existingQcId) {
        await updateQCStatus(existingQcId, 'VALIDATING')
        this.emitToRenderer('qc:status-update', { qcId: existingQcId, status: 'VALIDATING' })
      }

      // Validate numbering before merge
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

      // Step 2: Set MERGING status before merge
      if (existingQcId) {
        await updateQCStatus(existingQcId, 'MERGING')
        this.emitToRenderer('qc:status-update', { qcId: existingQcId, status: 'MERGING' })
      }

      // Create merged file path in .qc folder
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
      
      // Set status to FAILED if we have an existing QC record
      if (existingQcId) {
        await updateQCRecord(existingQcId, {
          status: 'FAILED',
          error_message: `Merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        })
        const updatedRecord = await getQCRecord(existingQcId)
        if (updatedRecord) {
          this.emitToRenderer('qc:status-update', { record: updatedRecord })
        }
      }
      
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

      // Check if batch should be submitted now that queue is empty
      await this.checkBatchSubmission()
    } finally {
      this.isProcessingQueue = false
    }
  }

  // @ts-ignore - Reserved for future use
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

      // Step 2: Mark as CONVERTED (PDF successfully created, pending batch submission)
      await updateQCStatus(record.qc_id, 'CONVERTED')
      this.emitToRenderer('qc:status-update', { qcId: record.qc_id, status: 'CONVERTED' })

      console.log(`[QCOrchestrator] File ${filename} converted to PDF, marked as CONVERTED`)

      // Step 3: Immediately add to batch and check if should submit
      await this.addToBatch(
        record.qc_id,
        pdfPath,
        filename,
        record.original_name,
        record.folder_path,
        record.file_type
      )
      
      // Check if batch should be submitted now
      await this.checkBatchSubmission()

      // Release lock - batch submission or further processing will handle the rest
      await releaseLock(lockBasePath, filePath)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[QCOrchestrator] Failed to process file ${filename}:`, error)

      // Release lock on error
      await releaseLock(lockBasePath, filePath)

      // Use the existing record ID, don't create a new one
      if (recordId) {
        // Check if this is a conversion error (happened during CONVERTING status)
        const currentRecord = await getQCRecord(recordId)
        const isConversionError = currentRecord?.status === 'CONVERTING'
        
        const failureStatus = isConversionError ? 'CONVERSION_FAILED' : 'FAILED'
        await updateQCStatus(recordId, failureStatus, errorMessage)
        notifyQCFailed(filename, errorMessage)
        this.emitToRenderer('qc:status-update', {
          qcId: recordId,
          status: failureStatus,
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

  // @ts-ignore - Reserved for future use
  private async submitToExternalAPI(
    qcId: string,
    pdfPath: string,
    filename: string
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // ===== BATCH PROCESSING METHODS =====

  private async addToBatch(
    qcId: string,
    pdfPath: string,
    filename: string,
    originalName: string,
    folderPath: string | null,
    fileType: string | null
  ): Promise<void> {
    console.log(`[QCOrchestrator] Adding ${filename} to batch (current size: ${this.convertedPdfBatch.length})`)

    this.convertedPdfBatch.push({
      qcId,
      pdfPath,
      filename,
      originalName,
      folderPath,
      fileType
    })

    // Start batch timeout timer on first file
    if (this.convertedPdfBatch.length === 1) {
      this.startBatchTimeout()
    }

    // Check if we should submit the batch now
    await this.checkBatchSubmission()
  }

  private startBatchTimeout(): void {
    const config = getConfig()
    const timeoutMs = (config.batchTimeoutSeconds || 30) * 1000

    // Clear existing timer
    if (this.batchTimeoutTimer) {
      clearTimeout(this.batchTimeoutTimer)
    }

    this.batchTimeoutTimer = setTimeout(async () => {
      console.log(`[QCOrchestrator] Batch timeout reached (${timeoutMs}ms), submitting batch...`)
      await this.submitBatchIfReady('timeout')
    }, timeoutMs)
  }

  private async checkBatchSubmission(): Promise<void> {
    const config = getConfig()
    const batchSize = config.batchSize || 10
    const queueIsEmpty = this.jobQueue.length === 0 && this.activeJobs === 0

    // Submit if batch size reached
    if (this.convertedPdfBatch.length >= batchSize) {
      console.log(`[QCOrchestrator] Batch size reached (${this.convertedPdfBatch.length}/${batchSize})`)
      await this.submitBatchIfReady('size')
    }
    // Submit if queue is empty and we have minimum batch size
    else if (queueIsEmpty && this.convertedPdfBatch.length >= (config.minBatchSize || 3)) {
      console.log(`[QCOrchestrator] Queue empty, submitting batch (${this.convertedPdfBatch.length} files)`)
      await this.submitBatchIfReady('queue-empty')
    }
  }

  private async submitBatchIfReady(trigger: 'size' | 'timeout' | 'queue-empty'): Promise<void> {
    if (this.isBatchProcessing || this.convertedPdfBatch.length === 0) {
      return
    }

    this.isBatchProcessing = true
    const batchFiles = [...this.convertedPdfBatch]

    try {
      // Clear timeout timer
      if (this.batchTimeoutTimer) {
        clearTimeout(this.batchTimeoutTimer)
        this.batchTimeoutTimer = null
      }

      this.convertedPdfBatch = [] // Clear batch

      console.log(`[QCOrchestrator] Submitting batch (trigger: ${trigger}, files: ${batchFiles.length})`)
      await this.submitBatch(batchFiles)
    } catch (error) {
      console.error('[QCOrchestrator] Error submitting batch:', error)
      // Re-add files to batch on error
      this.convertedPdfBatch.unshift(...batchFiles)
    } finally {
      this.isBatchProcessing = false
    }
  }

  private async submitBatch(
    batchFiles: Array<{
      qcId: string
      pdfPath: string
      filename: string
      originalName: string
      folderPath: string | null
      fileType: string | null
    }>
  ): Promise<void> {
    const batchId = uuidv4()
    const zipPath = getBatchZipPath(batchId)

    try {
      // Step 1: Update all batch files from CONVERTED to SUBMITTING status
      for (const file of batchFiles) {
        await updateQCStatus(file.qcId, 'SUBMITTING')
        this.emitToRenderer('qc:status-update', {
          qcId: file.qcId,
          status: 'SUBMITTING'
        })
      }

      // Step 2: Create ZIP file
      console.log(`[QCOrchestrator] Creating ZIP for batch ${batchId}...`)
      await this.createBatchZip(batchId, batchFiles, zipPath)

      // Get ZIP file size
      const stats = await fs.stat(zipPath)
      const zipSizeBytes = stats.size
      const zipSizeMB = (zipSizeBytes / (1024 * 1024)).toFixed(2)
      console.log(`[QCOrchestrator] ZIP created: ${zipSizeMB}MB`)

      // Create batch record
      await createBatchRecord(batchId, zipPath, batchFiles.length, zipSizeBytes)

      // Create manifest
      const manifest: BatchManifest = {
        batch_id: batchId,
        submitted_at: new Date().toISOString(),
        file_count: batchFiles.length,
        files: {}
      }

      batchFiles.forEach((file) => {
        manifest.files[`${file.qcId}.pdf`] = {
          original_name: file.originalName,
          folder: file.folderPath,
          file_type: file.fileType
        }
      })

      // Submit to external API
      const service = getQCExternalService()
      const response = await service.submitBatchForQC(zipPath, batchId, manifest)

      // Update batch status
      await updateBatchStatus(batchId, 'SUBMITTED')

      // Update records with batch info and job IDs
      const jobMappings = response.jobs.map((job, index) => ({
        qcId: job.qc_id,
        jobId: job.job_id,
        order: index
      }))

      await updateBatchRecords(batchId, jobMappings)

      // Record history for each file
      for (const file of batchFiles) {
        const job = response.jobs.find((j) => j.qc_id === file.qcId)
        if (job) {
          const record = await getQCRecord(file.qcId)
          await recordBatchHistory(file.qcId, batchId, job.job_id, record!.retry_count + 1, 'PROCESSING')
        }
      }

      // Update all records to PROCESSING status
      for (const file of batchFiles) {
        await updateQCStatus(file.qcId, 'PROCESSING')
        this.emitToRenderer('qc:status-update', {
          qcId: file.qcId,
          status: 'PROCESSING',
          batchId: batchId
        })
      }

      console.log(`[QCOrchestrator] Batch ${batchId} submitted successfully with ${response.jobs.length} jobs`)

      // Emit batch creation event
      this.emitToRenderer('qc:batch-created', {
        batchId,
        fileCount: batchFiles.length,
        zipSize: zipSizeBytes
      })
    } catch (error) {
      console.error(`[QCOrchestrator] Failed to submit batch ${batchId}:`, error)
      
      // Handle 504 Gateway Timeout specifically - batch may have been created on backend
      if (error instanceof GatewayTimeoutError) {
        console.warn(
          `[QCOrchestrator] Batch ${batchId} hit 504 timeout - batch likely created on backend, marking records for verification`
        )

        // Set records to PENDING_VERIFICATION - polling will detect backend batch
        for (const file of batchFiles) {
          await updateQCStatus(
            file.qcId,
            'PENDING_VERIFICATION',
            'Batch submitted but received timeout - verifying with backend'
          )
          this.emitToRenderer('qc:status-update', {
            qcId: file.qcId,
            status: 'PENDING_VERIFICATION',
            batchId: batchId,
            message: 'Verifying batch submission status with backend...'
          })
        }

        // Mark batch as SUBMITTED optimistically (polling will confirm)
        try {
          await updateBatchStatus(batchId, 'SUBMITTED')
        } catch (updateError) {
          console.error(`[QCOrchestrator] Failed to update batch ${batchId} to SUBMITTED:`, updateError)
        }

        // Emit recovery notification
        this.emitToRenderer('qc:batch-recovery', {
          batchId,
          status: 'PENDING_VERIFICATION',
          fileCount: batchFiles.length,
          message: 'Batch submission received timeout - checking backend status...'
        })

        console.log(
          `[QCOrchestrator] Records marked for verification. Polling will confirm batch ${batchId} creation.`
        )
        return
      }

      // Handle 503 Service Unavailable - similar recovery
      if (error instanceof ServiceUnavailableError) {
        console.warn(
          `[QCOrchestrator] Batch ${batchId} got 503 Service Unavailable - marking for verification`
        )

        for (const file of batchFiles) {
          await updateQCStatus(
            file.qcId,
            'PENDING_VERIFICATION',
            'Service temporarily unavailable - will retry'
          )
          this.emitToRenderer('qc:status-update', {
            qcId: file.qcId,
            status: 'PENDING_VERIFICATION',
            message: 'Service temporarily unavailable - retrying...'
          })
        }

        this.emitToRenderer('qc:batch-recovery', {
          batchId,
          status: 'PENDING_VERIFICATION',
          fileCount: batchFiles.length,
          message: 'Service unavailable - will retry batch submission'
        })

        // Re-add to batch for retry
        this.convertedPdfBatch.unshift(...batchFiles)
        console.log(`[QCOrchestrator] Re-queued batch ${batchId} for retry`)
        return
      }

      // Handle batch submission validation errors - mark as FAILED
      if (error instanceof BatchSubmissionError) {
        console.error(`[QCOrchestrator] Batch ${batchId} validation failed:`, error.message)

        for (const file of batchFiles) {
          await updateQCStatus(file.qcId, 'FAILED', `Batch validation failed: ${error.message}`)
          this.emitToRenderer('qc:status-update', {
            qcId: file.qcId,
            status: 'FAILED',
            error: error.message
          })
        }
        throw error
      }

      // All other errors - mark as FAILED
      const errorMessage = error instanceof Error ? error.message : String(error)
      for (const file of batchFiles) {
        await updateQCStatus(file.qcId, 'FAILED', `Batch submission failed: ${errorMessage}`)
        this.emitToRenderer('qc:status-update', {
          qcId: file.qcId,
          status: 'FAILED'
        })
      }
      
      throw error
    }
  }

  private async createBatchZip(
    batchId: string,
    batchFiles: Array<{ qcId: string; pdfPath: string; originalName: string; folderPath: string | null; fileType: string | null }>,
    zipPath: string
  ): Promise<void> {
    const zip = new AdmZip()

    // Create manifest
    const manifest: BatchManifest = {
      batch_id: batchId,
      submitted_at: new Date().toISOString(),
      file_count: batchFiles.length,
      files: {}
    }

    // Add PDFs with qc_id as filename
    for (const file of batchFiles) {
      const pdfFilename = `${file.qcId}.pdf`
      
      // Add PDF to ZIP
      zip.addLocalFile(file.pdfPath, '', pdfFilename)
      
      // Add to manifest
      manifest.files[pdfFilename] = {
        original_name: file.originalName,
        folder: file.folderPath,
        file_type: file.fileType
      }
    }

    // Add manifest.json
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)))

    // Write ZIP file
    await new Promise<void>((resolve, reject) => {
      zip.writeZip(zipPath, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })

    console.log(`[QCOrchestrator] ZIP created: ${zipPath}`)
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
      // Poll batches (more efficient)
      await this.pollProcessingBatches()

      // Check for PENDING_VERIFICATION records (504 recovery)
      await this.pollPendingVerificationRecords()

      // Then poll individual records without batch_id (backward compatibility)
      const processingRecords = await getProcessingRecords()
      // SAFEGUARD: Only poll records in PROCESSING status
      // Never auto-retry failed jobs - user must manually click "Retry" button
      const individualRecords = processingRecords.filter(
        r => !r.batch_id && r.status === 'PROCESSING'
      )

      for (const record of individualRecords) {
        await this.checkQCStatus(record)
      }
    } catch (error) {
      console.error('[QCOrchestrator] Error polling records:', error)
    }
  }

  private async pollPendingVerificationRecords(): Promise<void> {
    try {
      // Get all records in PENDING_VERIFICATION status (potential 504 recovery)
      const processingRecords = await getProcessingRecords()
      const pendingVerification = processingRecords.filter((r) => r.status === 'PENDING_VERIFICATION')

      for (const record of pendingVerification) {
        if (!record.batch_id) continue

        try {
          console.log(
            `[QCOrchestrator] Verifying PENDING_VERIFICATION record ${record.qc_id} in batch ${record.batch_id}`
          )

          // Get batch records to verify batch exists and has job_id
          const batchRecords = await getRecordsByBatchId(record.batch_id)
          if (batchRecords.length === 0) {
            console.warn(
              `[QCOrchestrator] No records found for batch ${record.batch_id}, batch may not have been created`
            )
            // Batch not found - mark as FAILED
            await updateQCStatus(
              record.qc_id,
              'FAILED',
              'Batch verification failed - batch not found on backend'
            )
            this.emitToRenderer('qc:status-update', {
              qcId: record.qc_id,
              status: 'FAILED',
              error: 'Batch not found'
            })
            continue
          }

          // Check if record has external_qc_id (job_id) assigned
          if (!record.external_qc_id) {
            console.warn(
              `[QCOrchestrator] Record ${record.qc_id} has no external_qc_id yet, batch may still be processing`
            )
            // Still waiting for job_ids, keep in PENDING_VERIFICATION
            continue
          }

          // Record has job_id and batch_id exists - transition to PROCESSING
          console.log(
            `[QCOrchestrator] Verified record ${record.qc_id} - batch ${record.batch_id} exists with job ${record.external_qc_id}`
          )
          await updateQCStatus(record.qc_id, 'PROCESSING')
          this.emitToRenderer('qc:status-update', {
            qcId: record.qc_id,
            status: 'PROCESSING',
            batchId: record.batch_id,
            message: 'Batch verified - now processing'
          })

          // Now it will be polled as normal PROCESSING record
        } catch (error) {
          console.error(
            `[QCOrchestrator] Error verifying record ${record.qc_id}:`,
            error
          )
        }
      }
    } catch (error) {
      console.error('[QCOrchestrator] Error polling pending verification records:', error)
    }
  }

  private async pollProcessingBatches(): Promise<void> {
    try {
      // CONSTRAINT: getProcessingBatches() only returns batches with status != FAILED
      // Once a batch fails completely, it is never polled again
      const batches = await getProcessingBatches()

      for (const batch of batches) {
        await this.checkBatchStatus(batch.batch_id)
      }
    } catch (error) {
      console.error('[QCOrchestrator] Error polling batches:', error)
    }
  }

  private async checkBatchStatus(batchId: string): Promise<void> {
    try {
      const service = getQCExternalService()
      const batchStatus = await service.getQCBatchStatus(batchId)

      // Update batch record
      await updateBatchStatus(
        batchId,
        batchStatus.status,
        batchStatus.completed_count,
        batchStatus.failed_count,
        batchStatus.processing_count
      )

      // Update individual job statuses
      for (const job of batchStatus.jobs) {
        const record = await getQCRecordByExternalId(job.job_id)
        if (!record) continue

        if (job.status === 'COMPLETED' && job.result) {
          // Handle completion - use issue_count from job response
          await this.handleQCComplete(record, {
            job_id: job.job_id,
            status: 'COMPLETED',
            result: job.result,
            issues_count: job.issue_count || job.issues_count || 0, // API returns issue_count
            created_at: batchStatus.submitted_at,
            updated_at: batchStatus.updated_at
          })
        } else if (job.status === 'FAILED') {
          // ⚠️ IMPORTANT CONSTRAINT: Job remains in batch_id even after failure
          // Jobs stay associated with their original batch for audit trail
          // User MUST manually click "Retry" button to attempt processing again
          // Retry will clear batch_id and allow re-accumulation into new batch
          await updateQCStatus(record.qc_id, 'FAILED', job.error || 'QC processing failed')
          notifyQCFailed(record.original_name, job.error || 'QC processing failed')
          this.emitToRenderer('qc:status-update', {
            qcId: record.qc_id,
            status: 'FAILED',
            error: job.error,
            batchId: batchId
          })
        }
      }

      // Emit batch progress update
      this.emitToRenderer('qc:batch-progress', {
        batchId,
        status: batchStatus.status,
        completed: batchStatus.completed_count,
        failed: batchStatus.failed_count,
        total: batchStatus.file_count,
        successRate: batchStatus.success_rate
      })

      console.log(
        `[QCOrchestrator] Batch ${batchId} status: ${batchStatus.status} (${batchStatus.completed_count}/${batchStatus.file_count} completed)`
      )
    } catch (error) {
      console.error(`[QCOrchestrator] Error checking batch status for ${batchId}:`, error)
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
        // Individual record failure - no auto-retry, awaits manual user action
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

      // Sanitize YAML front matter to fix common parsing issues
      const sanitizedMarkdown = sanitizeYAMLFrontMatter(reportMarkdown)

      await fs.writeFile(paths.reportMdPath, sanitizedMarkdown, 'utf-8')

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
    console.log(
      `[QCOrchestrator] CONSTRAINT: Clearing batch_id for re-accumulation (was: ${record.batch_id})`
    )

    // 🔒 SAFEGUARD: Only user action (manual retry) can reset batch assignment
    // Clear batch_id to allow re-accumulation into potentially different batch
    // Keep original_batch_id for audit trail showing first batch it belonged to
    // Increment retry_count to track how many times user retried
    const newRetryCount = (record.retry_count || 0) + 1
    await updateQCRecord(qcId, {
      status: 'QUEUED',
      batch_id: null, // Clear current batch - allows re-accumulation
      external_qc_id: null,
      error_message: null,
      retry_count: newRetryCount,
      submitted_at: new Date().toISOString() // Reset timestamp to avoid stuck detection
    })

    console.log(`[QCOrchestrator] Retry count incremented to: ${newRetryCount}`)

    this.emitToRenderer('qc:status-update', { qcId, status: 'QUEUED' })

    // Enqueue the retry job (respects concurrency limits)
    await this.enqueueJob(record.file_path, record.original_name, true)

    // Trigger queue processing immediately
    this.processQueue()
  }

  async retryFailedBatch(batchId: string): Promise<void> {
    console.log(`[QCOrchestrator] Retrying failed files in batch: ${batchId}`)

    // Get all records in this batch (regardless of current status)
    const allRecords = await getRecordsByBatchId(batchId)
    const failedRecords = allRecords.filter((r) => r.status === 'FAILED')

    if (failedRecords.length === 0) {
      console.log(`[QCOrchestrator] No failed records found in batch ${batchId}`)
      return
    }

    console.log(
      `[QCOrchestrator] Found ${failedRecords.length} failed records to retry in batch ${batchId}`
    )

    // Retry each failed record individually (this clears their batch_id)
    for (const record of failedRecords) {
      await this.retryRecord(record.qc_id)
    }

    // After retrying, get remaining records still in this batch
    const remainingRecords = await getRecordsByBatchId(batchId)
    const completedCount = remainingRecords.filter((r) => r.status === 'COMPLETED').length
    const failedCount = remainingRecords.filter((r) => r.status === 'FAILED').length
    const processingCount = remainingRecords.filter(
      (r) => r.status === 'PROCESSING' || r.status === 'DOWNLOADING'
    ).length

    // Update batch status based on remaining records
    let newStatus: BatchStatus
    if (remainingRecords.length === 0) {
      // All records were retried and removed from batch
      newStatus = 'COMPLETED'
    } else if (failedCount === 0 && processingCount === 0) {
      // Only completed records remain
      newStatus = 'COMPLETED'
    } else if (failedCount > 0 && processingCount === 0) {
      // Still has failed records
      newStatus = 'FAILED'
    } else if (completedCount > 0 && (failedCount > 0 || processingCount > 0)) {
      // Mixed results
      newStatus = 'PARTIAL_COMPLETE'
    } else {
      // Still processing
      newStatus = 'PROCESSING'
    }

    await updateBatchStatus(batchId, newStatus, completedCount, failedCount, processingCount)

    console.log(
      `[QCOrchestrator] Batch ${batchId} updated: ${remainingRecords.length} records remaining, status: ${newStatus}`
    )
    console.log(`[QCOrchestrator] Batch retry complete: ${failedRecords.length} files re-queued`)
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
