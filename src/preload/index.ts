import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Get current server info from memory
  getServerInfo: (): Promise<{ port: number } | null> => ipcRenderer.invoke('get-server-info'),

  // Check if server is running
  isServerRunning: (): Promise<boolean> => ipcRenderer.invoke('is-server-running'),

  // Check if server is starting
  isServerStarting: (): Promise<boolean> => ipcRenderer.invoke('is-server-starting'),

  // Listen to server status changes
  onServerStatusChange: (callback: (event: any, data: { status: string; message: string }) => void) => {
    ipcRenderer.on('server-status-change', callback)
    return () => ipcRenderer.removeListener('server-status-change', callback)
  },

  // Listen to quit blocked notifications
  onQuitBlocked: (callback: (event: any, data: { message: string }) => void) => {
    ipcRenderer.on('show-quit-blocked-toast', callback)
    return () => ipcRenderer.removeListener('show-quit-blocked-toast', callback)
  },

  // Listen to update status changes
  onUpdateStatus: (
    callback: (
      event: any,
      data: { status: string; message: string; version?: string; percent?: number }
    ) => void
  ) => {
    ipcRenderer.on('update-status', callback)
    return () => ipcRenderer.removeListener('update-status', callback)
  },

  // Read HTML file content
  readHtmlFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('read-html-file', filePath),

  // Read log file content
  readLogFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('read-log-file', filePath),

  // Get app version
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  // Auth token management
  storeAuthToken: (token: string): Promise<void> =>
    ipcRenderer.invoke('store-auth-token', token),

  getAuthToken: (): Promise<string | null> =>
    ipcRenderer.invoke('get-auth-token'),

  clearAuthToken: (): Promise<void> =>
    ipcRenderer.invoke('clear-auth-token'),

  // QC Module APIs
  qc: {
    getRecords: (filters?: any, limit?: number, offset?: number) =>
      ipcRenderer.invoke('qc:get-records', filters, limit, offset),
    getRecord: (qcId: string) => ipcRenderer.invoke('qc:get-record', qcId),
    getStats: () => ipcRenderer.invoke('qc:get-stats'),
    getConfig: () => ipcRenderer.invoke('qc:get-config'),
    updateConfig: (updates: any) => ipcRenderer.invoke('qc:update-config', updates),
    testConnection: () => ipcRenderer.invoke('qc:test-connection'),
    addWatchFolder: (folderPath: string) => ipcRenderer.invoke('qc:add-watch-folder', folderPath),
    removeWatchFolder: (folderPath: string) =>
      ipcRenderer.invoke('qc:remove-watch-folder', folderPath),
    startWatcher: () => ipcRenderer.invoke('qc:start-watcher'),
    stopWatcher: () => ipcRenderer.invoke('qc:stop-watcher'),
    isWatcherActive: () => ipcRenderer.invoke('qc:is-watcher-active'),
    deleteRecord: (qcId: string) => ipcRenderer.invoke('qc:delete-record', qcId),
    deleteAllRecords: () => ipcRenderer.invoke('qc:delete-all-records'),
    retryRecord: (qcId: string) => ipcRenderer.invoke('qc:retry-record', qcId),
    uploadPdfForRecord: (qcId: string, pdfPath: string) =>
      ipcRenderer.invoke('qc:upload-pdf-for-record', qcId, pdfPath),
    convertReportToDocx: (qcId: string) => ipcRenderer.invoke('qc:convert-report-to-docx', qcId),
    getWatcherStatus: () => ipcRenderer.invoke('qc:get-watcher-status'),
    getBatches: (statusFilter?: string[]) => ipcRenderer.invoke('qc:get-batches', statusFilter),
    retryBatch: (batchId: string) => ipcRenderer.invoke('qc:retry-batch', batchId),
    getBatchFiles: (batchId: string) => ipcRenderer.invoke('qc:get-batch-files', batchId),
    onFileDetected: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('qc:file-detected', callback)
      return () => ipcRenderer.removeListener('qc:file-detected', callback)
    },
    onStatusUpdate: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('qc:status-update', callback)
      return () => ipcRenderer.removeListener('qc:status-update', callback)
    },
    onQueueUpdate: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('qc:queue-update', callback)
      return () => ipcRenderer.removeListener('qc:queue-update', callback)
    },
    onError: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('qc:error', callback)
      return () => ipcRenderer.removeListener('qc:error', callback)
    }
  },

  // Numbering Checker Module APIs
  numbering: {
    validate: (questionsPath: string, solutionsPath: string, expectedCount?: number) =>
      ipcRenderer.invoke('numbering:validate', questionsPath, solutionsPath, expectedCount)
  },

  // Shell and Dialog APIs
  shell: {
    openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path)
  },
  dialog: {
    showOpenDialog: (options: any) => ipcRenderer.invoke('dialog:show-open-dialog', options),
    showSaveDialog: (options: any) => ipcRenderer.invoke('dialog:show-save-dialog', options)
  },
  file: {
    copy: (sourcePath: string, destPath: string) => ipcRenderer.invoke('file:copy', sourcePath, destPath)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch {
    // Handle context bridge error silently
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
