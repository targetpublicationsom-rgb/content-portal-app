import { ipcMain } from 'electron'
import { getQCOrchestrator } from './qcOrchestrator'
import {
  getQCRecord,
  getQCRecords,
  getQCStats,
  deleteQCRecord,
  deleteAllQCRecords
} from './qcStateManager'
import { getConfig } from './qcConfig'
import { testConnection } from './qcExternalService'
import { getQCWatcher, isQCWatcherActive } from './qcWatcher'
import type { QCFilters } from '../../shared/qc.types'

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
        return { success: false, error: 'No watch folders configured in .env (VITE_QC_WATCH_FOLDER)' }
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
      const orchestrator = getQCOrchestrator()
      await orchestrator.retryRecord(qcId)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retry record'
      console.error('[QC IPC] Error retrying record:', error)
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

  console.log('[QC IPC] Handlers unregistered')
}
