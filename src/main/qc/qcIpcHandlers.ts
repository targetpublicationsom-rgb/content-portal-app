import { ipcMain } from 'electron'
import * as path from 'path'
import { getQCOrchestrator } from './qcOrchestrator'
import {
  getQCRecord,
  getQCRecords,
  getQCStats,
  deleteQCRecord,
  deleteAllQCRecords,
  updateQCRecord,
  getQCBatches
} from './qcStateManager'
import { getConfig, getQCOutputPaths, saveConfig } from './qcConfig'
import { testConnection } from './qcExternalService'
import { getQCWatcher, isQCWatcherActive } from './qcWatcher'
import type { QCFilters, QCConfig } from '../../shared/qc.types'
import type { WorkerMessage } from './workers/types'
import type { WatchEvent } from './qcWatcher'
import * as fs from 'fs/promises'

export function registerQCIpcHandlers(): void {
  ipcMain.handle(
    'qc:get-records',
    async (_event, filters?: QCFilters, limit?: number, offset?: number) => {
      try {
        const records = await getQCRecords(filters, limit, offset)
        return { success: true, data: records }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get QC records'
        console.error('[QC IPC] Error getting records:', error)
        return { success: false, error: message }
      }
    }
  )

  ipcMain.handle('qc:get-record', async (_event, qcId: string) => {
    try {
      const record = await getQCRecord(qcId)
      if (!record) {
        return { success: false, error: 'QC record not found' }
      }
      return { success: true, data: record }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get QC record'
      console.error('[QC IPC] Error getting record:', error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('qc:get-stats', async () => {
    try {
      const stats = await getQCStats()
      return { success: true, data: stats }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get QC statistics'
      console.error('[QC IPC] Error getting stats:', error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('qc:get-config', async () => {
    try {
      const config = getConfig()
      return { success: true, data: config }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get QC configuration'
      console.error('[QC IPC] Error getting config:', error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('qc:test-connection', async () => {
    try {
      const result = await testConnection()
      return { success: true, data: result }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed'
      console.error('[QC IPC] Connection test error:', error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('qc:get-watcher-status', async () => {
    try {
      const isActive = isQCWatcherActive()
      const watcher = getQCWatcher()
      const folders = watcher.getWatchedFolders()

      return { success: true, data: { isActive, watchedFolders: folders } }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get watcher status'
      console.error('[QC IPC] Error getting watcher status:', error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('qc:start-watcher', async () => {
    try {
      const config = getConfig()
      if (config.watchFolders.length === 0) {
        return {
          success: false,
          error: 'No watch folders configured in .env (VITE_QC_WATCH_FOLDER)'
        }
      }

      const orchestrator = getQCOrchestrator()
      await orchestrator.restartWatcher()

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start watcher'
      console.error('[QC IPC] Error starting watcher:', error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('qc:stop-watcher', async () => {
    try {
      const { stopQCWatcher } = await import('./qcWatcher')
      stopQCWatcher()

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop watcher'
      console.error('[QC IPC] Error stopping watcher:', error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('qc:delete-record', async (_event, qcId: string) => {
    try {
      const deleted = await deleteQCRecord(qcId)
      if (!deleted) {
        return { success: false, error: 'Record not found' }
      }
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete record'
      console.error('[QC IPC] Error deleting record:', error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('qc:delete-all-records', async () => {
    try {
      const count = await deleteAllQCRecords()
      return { success: true, data: count }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete all records'
      console.error('[QC IPC] Error deleting all records:', error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('qc:retry-record', async (_event, qcId: string) => {
    try {
      const record = await getQCRecord(qcId)
      if (!record) {
        return { success: false, error: 'Record not found' }
      }

      // Handle NUMBERING_FAILED retry specially
      if (record.status === 'NUMBERING_FAILED') {
        console.log('[QC IPC] Retrying NUMBERING_FAILED record:', qcId)

        if (!record.folder_path || !record.source_files) {
          return {
            success: false,
            error: 'Cannot retry: missing folder path or source files'
          }
        }

        // Parse source files
        const sourceFiles = JSON.parse(record.source_files) as string[]
        if (sourceFiles.length !== 2) {
          return {
            success: false,
            error: 'Cannot retry: expected 2 source files (MCQs and Solution)'
          }
        }

        // Update record status to QUEUED for retry (keep record visible)
        await updateQCRecord(qcId, {
          status: 'QUEUED',
          error_message: null,
          retry_count: record.retry_count + 1
        })

        // Reconstruct file paths
        const mcqsPath = path.join(record.folder_path, sourceFiles[0])
        const solutionPath = path.join(record.folder_path, sourceFiles[1])

        // Create WatchEvent to trigger merge with validation
        const watchEvent: WatchEvent = {
          type: 'add',
          filePath: mcqsPath,
          filename: sourceFiles[0],
          timestamp: new Date().toISOString(),
          folderPath: record.folder_path,
          chapterName: record.chapter_name || 'Unknown',
          fileType: (record.file_type || 'mcqs-solution') as
            | 'theory'
            | 'mcqs-solution'
            | 'single-file',
          relatedFiles: {
            mcqs: mcqsPath,
            solution: solutionPath
          }
        }

        // Call enqueueJobWithMerge with existing record ID
        const orchestrator = getQCOrchestrator()
        await orchestrator.enqueueJobWithMerge(watchEvent, qcId)

        return { success: true }
      }

      // Handle normal retry for other failed records
      const orchestrator = getQCOrchestrator()
      await orchestrator.retryRecord(qcId)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retry record'
      console.error('[QC IPC] Error retrying record:', error)
      return { success: false, error: message }
    }
  })

  // Convert report to DOCX on-demand
  ipcMain.handle('qc:convert-report-to-docx', async (_event, qcId: string) => {
    try {
      const orchestrator = getQCOrchestrator()
      if (!orchestrator) {
        return { success: false, error: 'QC orchestrator not initialized' }
      }

      const record = await getQCRecord(qcId)
      if (!record) {
        return { success: false, error: 'QC record not found' }
      }

      if (!record.report_md_path) {
        return { success: false, error: 'No markdown report found' }
      }

      // Check if MD file exists
      try {
        await fs.access(record.report_md_path)
      } catch {
        return { success: false, error: 'Markdown report file not found on disk' }
      }

      const paths = getQCOutputPaths(record.qc_id, record.original_name)

      // Check if DOCX already exists
      try {
        await fs.access(paths.reportDocxPath)
        console.log('[QC IPC] DOCX already exists:', paths.reportDocxPath)
        return {
          success: true,
          data: { docxPath: paths.reportDocxPath, alreadyExists: true }
        }
      } catch {
        // DOCX doesn't exist, need to convert
      }

      // Convert using Pandoc worker
      console.log('[QC IPC] Converting MD to DOCX on-demand for:', qcId)
      const workerPool = orchestrator.getWorkerPool()
      if (!workerPool) {
        return { success: false, error: 'Worker pool not available' }
      }

      const pandocMessage: WorkerMessage = {
        id: `pandoc-on-demand-${Date.now()}`,
        type: 'convert-md-to-docx',
        data: { mdPath: record.report_md_path, docxPath: paths.reportDocxPath }
      }

      await workerPool.dispatchJob('pandoc', pandocMessage)

      // Update database with DOCX path
      await updateQCRecord(qcId, { report_docx_path: paths.reportDocxPath })

      console.log('[QC IPC] DOCX conversion completed:', paths.reportDocxPath)
      return {
        success: true,
        data: { docxPath: paths.reportDocxPath, alreadyExists: false }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to convert report'
      console.error('[QC IPC] Error converting report:', error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('qc:update-config', async (_event, newConfig: Partial<QCConfig>) => {
    try {
      const currentConfig = getConfig()

      // Merge with current config
      const updatedConfig: QCConfig = {
        ...currentConfig,
        ...newConfig
      }

      // Save to file
      saveConfig(updatedConfig)

      // Restart watcher if watch folders changed
      if (newConfig.watchFolders && newConfig.watchFolders.length > 0) {
        const orchestrator = getQCOrchestrator()
        await orchestrator.restartWatcher()
      }

      return { success: true, data: updatedConfig }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update configuration'
      console.error('[QC IPC] Error updating config:', error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('qc:add-watch-folder', async (_event, folderPath: string) => {
    try {
      const currentConfig = getConfig()

      // Check if folder already exists
      if (currentConfig.watchFolders.includes(folderPath)) {
        return { success: false, error: 'Folder is already being watched' }
      }

      // Add folder
      const updatedConfig: QCConfig = {
        ...currentConfig,
        watchFolders: [...currentConfig.watchFolders, folderPath]
      }

      // Save to file
      saveConfig(updatedConfig)

      // Restart watcher with new folders
      const orchestrator = getQCOrchestrator()
      await orchestrator.restartWatcher()

      return { success: true, data: updatedConfig }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add watch folder'
      console.error('[QC IPC] Error adding watch folder:', error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('qc:remove-watch-folder', async (_event, folderPath: string) => {
    try {
      const currentConfig = getConfig()

      // Remove folder
      const updatedConfig: QCConfig = {
        ...currentConfig,
        watchFolders: currentConfig.watchFolders.filter((f) => f !== folderPath)
      }

      // Save to file
      saveConfig(updatedConfig)

      // Restart watcher with remaining folders (or stop if none left)
      const orchestrator = getQCOrchestrator()
      if (updatedConfig.watchFolders.length > 0) {
        await orchestrator.restartWatcher()
      } else {
        const { stopQCWatcher } = await import('./qcWatcher')
        stopQCWatcher()
      }

      return { success: true, data: updatedConfig }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove watch folder'
      console.error('[QC IPC] Error removing watch folder:', error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('qc:get-batches', async (_event, statusFilter?: string[]) => {
    try {
      const batches = await getQCBatches(statusFilter as any)
      return { success: true, data: batches }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get batches'
      console.error('[QC IPC] Error getting batches:', error)
      return { success: false, error: message }
    }
  })

  console.log('[QC IPC] Handlers registered')
}

export function unregisterQCIpcHandlers(): void {
  ipcMain.removeHandler('qc:get-records')
  ipcMain.removeHandler('qc:get-record')
  ipcMain.removeHandler('qc:get-stats')
  ipcMain.removeHandler('qc:get-config')
  ipcMain.removeHandler('qc:test-connection')
  ipcMain.removeHandler('qc:get-watcher-status')
  ipcMain.removeHandler('qc:start-watcher')
  ipcMain.removeHandler('qc:stop-watcher')
  ipcMain.removeHandler('qc:delete-record')
  ipcMain.removeHandler('qc:delete-all-records')
  ipcMain.removeHandler('qc:retry-record')
  ipcMain.removeHandler('qc:convert-report-to-docx')
  ipcMain.removeHandler('qc:update-config')
  ipcMain.removeHandler('qc:get-batches')
  ipcMain.removeHandler('qc:add-watch-folder')
  ipcMain.removeHandler('qc:remove-watch-folder')

  console.log('[QC IPC] Handlers unregistered')
}
