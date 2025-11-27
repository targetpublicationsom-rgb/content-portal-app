import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import * as fs from 'fs'
import { getWordConverter, initializeWordConverter, shutdownWordConverter } from './wordConverter'
import { getQCWatcher, startQCWatcher, stopQCWatcher } from './qcWatcher'
import { getQCExternalService, configureQCExternalService } from './qcExternalService'
import { convertMdToDocx, initializePandoc, isPandocAvailable } from './pandocConverter'
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
  notifyQCStarted,
  notifyConversionComplete,
  notifyQCSubmitted,
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
      initializeQCDatabase()
      initializePandoc()
      initializeQCNotifications(mainWindow)
      await initializeWordConverter()

      // Setup event listeners
      this.setupWatcherEvents()
      this.setupConverterEvents()

      // Configure external service if API settings exist
      const config = getConfig()
      if (config.apiUrl && config.apiKey) {
        configureQCExternalService(config.apiUrl, config.apiKey)
      }

      // Start polling for processing records
      this.startStatusPolling()

      // Start watcher if auto-submit is enabled and folders are configured
      if (config.autoSubmit && config.watchFolders.length > 0) {
        startQCWatcher(config.watchFolders)
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

    // Shutdown Word
    await shutdownWordConverter()

    // Close database
    closeQCDatabase()

    this.isInitialized = false
    console.log('[QCOrchestrator] Shutdown complete')
  }

  private setupWatcherEvents(): void {
    const watcher = getQCWatcher()

    watcher.on('file-detected', async (event: WatchEvent) => {
      console.log(`[QCOrchestrator] File detected: ${event.filename}`)
      await this.processNewFile(event.filePath, event.filename)
    })

    watcher.on('error', (error: string) => {
      console.error('[QCOrchestrator] Watcher error:', error)
      this.emitToRenderer('qc:error', { message: error })
    })
  }

  private setupConverterEvents(): void {
    const converter = getWordConverter()

    converter.on('conversion-start', (data: { docxPath: string; pdfPath: string }) => {
      console.log(`[QCOrchestrator] Conversion started: ${data.docxPath}`)
    })

    converter.on(
      'conversion-complete',
      (data: { docxPath: string; pdfPath: string; duration: number }) => {
        console.log(`[QCOrchestrator] Conversion complete: ${data.docxPath} (${data.duration}s)`)
      }
    )

    converter.on('conversion-error', (data: { docxPath: string; error: Error }) => {
      console.error(`[QCOrchestrator] Conversion error: ${data.docxPath}`, data.error)
    })

    converter.on('queue-update', (queueLength: number) => {
      this.emitToRenderer('qc:queue-update', { queueLength })
    })
  }

  private async processNewFile(filePath: string, filename: string): Promise<void> {
    let recordId: string | null = null
    const lockBasePath = getLockBasePath()

    try {
      // Clean stale locks first
      cleanStaleLocks(lockBasePath)

      // Check if file is currently locked by another user
      const existingLock = checkLock(lockBasePath, filePath)
      if (existingLock) {
        console.log(`[QCOrchestrator] File is locked by ${existingLock.processedBy}: ${filename}`)
        return
      }

      // Check if this file was already processed or is currently being processed
      const existingRecord = getRecordByFilePath(filePath)
      if (existingRecord) {
        // Never reprocess COMPLETED files automatically
        if (existingRecord.status === 'COMPLETED') {
          console.log(
            `[QCOrchestrator] Skipping - already completed by ${existingRecord.processed_by}: ${filename}`
          )
          return
        }

        // Skip if currently being processed (not FAILED)
        if (
          [
            'QUEUED',
            'CONVERTING',
            'SUBMITTING',
            'PROCESSING',
            'DOWNLOADING',
            'CONVERTING_REPORT'
          ].includes(existingRecord.status)
        ) {
          const timeSinceSubmit =
            new Date().getTime() - new Date(existingRecord.submitted_at).getTime()
          // If stuck for more than 10 minutes, mark as FAILED
          if (timeSinceSubmit < 10 * 60 * 1000) {
            console.log(
              `[QCOrchestrator] Skipping - already ${existingRecord.status} by ${existingRecord.processed_by}: ${filename}`
            )
            return
          } else {
            console.log(
              `[QCOrchestrator] Marking stuck file as FAILED (${existingRecord.status} for ${Math.round(timeSinceSubmit / 1000 / 60)} min): ${filename}`
            )
            updateQCStatus(
              existingRecord.qc_id,
              'FAILED',
              `Stuck in ${existingRecord.status} state for more than 10 minutes`
            )
            return
          }
        }

        // Skip FAILED files too - they need explicit retry via button
        if (existingRecord.status === 'FAILED') {
          console.log(`[QCOrchestrator] Skipping failed file - use Retry button: ${filename}`)
          return
        }
      }

      // Create QC record
      const record = createQCRecord(filePath)
      recordId = record.qc_id

      // Acquire lock before processing
      const lockResult = acquireLock(lockBasePath, record.qc_id, filePath)
      if (!lockResult.success) {
        console.log(
          `[QCOrchestrator] Could not acquire lock for ${filename}: ${lockResult.error || 'locked by ' + lockResult.lockedBy}`
        )
        updateQCStatus(record.qc_id, 'FAILED', lockResult.error || 'File is locked')
        return
      }

      notifyQCStarted(filename)
      this.emitToRenderer('qc:file-detected', { record })

      // Get output paths
      const paths = getQCOutputPaths(record.qc_id, filename)

      // Step 1: Convert DOCX to PDF
      updateQCStatus(record.qc_id, 'CONVERTING')
      this.emitToRenderer('qc:status-update', { qcId: record.qc_id, status: 'CONVERTING' })

      const pdfPath = await this.convertToPdf(filePath, paths.pdfPath)
      updateQCPdfPath(record.qc_id, pdfPath)
      notifyConversionComplete(filename)

      // Step 2: Submit to external API
      await this.submitToExternalAPI(record.qc_id, pdfPath, filename)

      // Release lock after successful processing
      releaseLock(lockBasePath, filePath)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[QCOrchestrator] Failed to process file ${filename}:`, error)

      // Release lock on error
      releaseLock(lockBasePath, filePath)

      // Use the existing record ID, don't create a new one
      if (recordId) {
        updateQCStatus(recordId, 'FAILED', errorMessage)
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
    const converter = getWordConverter()
    return await converter.convertDocxToPdf(docxPath, pdfPath)
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

    updateQCStatus(qcId, 'SUBMITTING')
    this.emitToRenderer('qc:status-update', { qcId, status: 'SUBMITTING' })

    const response = await service.submitPdfForQC(pdfPath, filename)
    updateQCExternalId(qcId, response.job_id)
    updateQCStatus(qcId, 'PROCESSING')
    notifyQCSubmitted(filename)
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
      const processingRecords = getProcessingRecords()

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
        updateQCStatus(record.qc_id, 'FAILED', 'QC processing failed')
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
      updateQCStatus(record.qc_id, 'DOWNLOADING')
      this.emitToRenderer('qc:status-update', { qcId: record.qc_id, status: 'DOWNLOADING' })

      fs.writeFileSync(paths.reportMdPath, reportMarkdown, 'utf-8')

      // Convert MD to DOCX
      updateQCStatus(record.qc_id, 'CONVERTING_REPORT')
      this.emitToRenderer('qc:status-update', { qcId: record.qc_id, status: 'CONVERTING_REPORT' })

      if (isPandocAvailable()) {
        await convertMdToDocx(paths.reportMdPath, paths.reportDocxPath)
      } else {
        console.warn('[QCOrchestrator] Pandoc not available, skipping DOCX conversion')
      }

      // Parse score and issues from markdown (extract from JSON if present)
      let score = 0
      let issuesFound = 0

      try {
        // Try to extract JSON from markdown
        const jsonMatch = reportMarkdown.match(/```json\s*({[\s\S]*?})\s*```/)
        if (jsonMatch) {
          const jsonData = JSON.parse(jsonMatch[1])
          issuesFound = jsonData.findings?.length || 0

          // Calculate simple score based on severity
          const severeIssues =
            jsonData.findings?.filter((f: any) => f.severity === 'Medium' || f.severity === 'High')
              .length || 0
          score = Math.max(0, 100 - severeIssues * 10 - (issuesFound - severeIssues) * 5)
        }
      } catch (parseError) {
        console.warn('[QCOrchestrator] Could not parse score from report:', parseError)
      }

      // Update record with report data
      updateQCReport(record.qc_id, paths.reportMdPath, paths.reportDocxPath, score, issuesFound)

      updateQCStatus(record.qc_id, 'COMPLETED')
      notifyQCCompleted(record.original_name, score)
      this.emitToRenderer('qc:status-update', {
        qcId: record.qc_id,
        status: 'COMPLETED',
        score: score,
        issuesFound: issuesFound
      })

      console.log(
        `[QCOrchestrator] QC complete for ${record.original_name} (Score: ${score}, Issues: ${issuesFound})`
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[QCOrchestrator] Error handling QC completion:`, error)
      updateQCStatus(record.qc_id, 'FAILED', errorMessage)
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
    reinitializeQCDatabase()

    const config = getConfig()
    if (config.watchFolders.length > 0) {
      startQCWatcher(config.watchFolders)
      console.log('[QCOrchestrator] Watcher restarted with folders from .env')
    }
  }

  async retryRecord(qcId: string): Promise<void> {
    const record = getQCRecord(qcId)
    if (!record) {
      throw new Error('Record not found')
    }

    console.log(`[QCOrchestrator] Manually retrying record: ${record.original_name}`)

    // Reset the record to QUEUED status
    updateQCStatus(qcId, 'QUEUED')
    updateQCRecord(qcId, { error_message: null, retry_count: 0 })

    // Process the file again
    await this.processNewFile(record.file_path, record.original_name)
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
