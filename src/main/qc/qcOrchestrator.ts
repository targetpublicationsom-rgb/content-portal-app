import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import * as fs from 'fs'
import { getWordConverter, initializeWordConverter, shutdownWordConverter } from './wordConverter'
import { getQCWatcher, startQCWatcher, stopQCWatcher } from './qcWatcher'
import { getQCExternalService, configureQCExternalService } from './qcExternalService'
import { convertMdToDocx, initializePandoc, isPandocAvailable } from './pandocConverter'
import { initializeQCConfig, getConfig, updateConfig, getQCOutputPaths } from './qcConfig'
import {
  initializeQCDatabase,
  createQCRecord,
  updateQCStatus,
  updateQCPdfPath,
  updateQCExternalId,
  updateQCReport,
  incrementRetryCount,
  getProcessingRecords,
  getRecordByFilePath,
  closeQCDatabase
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
      // Initialize all modules
      initializeQCDatabase()
      initializeQCConfig()
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

    try {
      // Check if this file was already processed recently (skip if within 5 minutes)
      const existingRecord = getRecordByFilePath(filePath)
      if (existingRecord) {
        const timeSinceSubmit =
          new Date().getTime() - new Date(existingRecord.submitted_at).getTime()
        if (timeSinceSubmit < 5 * 60 * 1000) {
          console.log(
            `[QCOrchestrator] Skipping duplicate (processed ${Math.round(timeSinceSubmit / 1000)}s ago): ${filename}`
          )
          return
        }
      }

      // Create QC record
      const record = createQCRecord(filePath)
      recordId = record.qc_id
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[QCOrchestrator] Failed to process file ${filename}:`, error)

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
    const config = getConfig()

    if (!service.isConfigured()) {
      throw new Error('External QC service not configured')
    }

    updateQCStatus(qcId, 'SUBMITTING')
    this.emitToRenderer('qc:status-update', { qcId, status: 'SUBMITTING' })

    try {
      const response = await service.submitPdfForQC(pdfPath, filename)
      updateQCExternalId(qcId, response.qc_id)
      updateQCStatus(qcId, 'PROCESSING')
      notifyQCSubmitted(filename)
      this.emitToRenderer('qc:status-update', {
        qcId,
        status: 'PROCESSING',
        externalQcId: response.qc_id
      })
    } catch (error) {
      // Retry logic
      const retryCount = incrementRetryCount(qcId)
      if (retryCount < config.maxRetries) {
        console.log(`[QCOrchestrator] Retrying submission (${retryCount}/${config.maxRetries})...`)
        setTimeout(() => {
          this.submitToExternalAPI(qcId, pdfPath, filename)
        }, 5000)
      } else {
        throw error
      }
    }
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

      if (status.status === 'completed') {
        await this.handleQCComplete(record)
      } else if (status.status === 'failed') {
        updateQCStatus(record.qc_id, 'FAILED', status.message || 'QC failed')
        notifyQCFailed(record.original_name, status.message || 'QC failed')
        this.emitToRenderer('qc:status-update', {
          qcId: record.qc_id,
          status: 'FAILED',
          error: status.message
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

  private async handleQCComplete(record: QCRecord): Promise<void> {
    if (!record.external_qc_id) {
      return
    }

    try {
      const service = getQCExternalService()
      const paths = getQCOutputPaths(record.qc_id, record.original_name)

      // Download report
      updateQCStatus(record.qc_id, 'DOWNLOADING')
      this.emitToRenderer('qc:status-update', { qcId: record.qc_id, status: 'DOWNLOADING' })

      const report = await service.getQCReport(record.external_qc_id)

      // Save MD report
      fs.writeFileSync(paths.reportMdPath, report.report_md, 'utf-8')

      // Convert MD to DOCX
      updateQCStatus(record.qc_id, 'CONVERTING_REPORT')
      this.emitToRenderer('qc:status-update', { qcId: record.qc_id, status: 'CONVERTING_REPORT' })

      if (isPandocAvailable()) {
        await convertMdToDocx(paths.reportMdPath, paths.reportDocxPath)
      } else {
        console.warn('[QCOrchestrator] Pandoc not available, skipping DOCX conversion')
      }

      // Update record with report data
      updateQCReport(
        record.qc_id,
        paths.reportMdPath,
        paths.reportDocxPath,
        report.score,
        report.issues_found
      )

      updateQCStatus(record.qc_id, 'COMPLETED')
      notifyQCCompleted(record.original_name, report.score)
      this.emitToRenderer('qc:status-update', {
        qcId: record.qc_id,
        status: 'COMPLETED',
        score: report.score,
        issuesFound: report.issues_found
      })

      console.log(
        `[QCOrchestrator] QC complete for ${record.original_name} (Score: ${report.score})`
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
    updateConfig({ apiUrl, apiKey })
    console.log('[QCOrchestrator] External service reconfigured')
  }

  async restartWatcher(folders: string[]): Promise<void> {
    stopQCWatcher()
    updateConfig({ watchFolders: folders })

    if (folders.length > 0) {
      startQCWatcher(folders)
      console.log('[QCOrchestrator] Watcher restarted with new folders')
    }
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
