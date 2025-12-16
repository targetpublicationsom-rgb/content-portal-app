import { ElectronAPI } from '@electron-toolkit/preload'

interface ServerInfo {
  port: number
}

interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
  filename: string
  timestamp: string
}

interface API {
  getServerInfoPath: () => Promise<string>
  getServerInfo: () => Promise<ServerInfo | null>
  isServerRunning: () => Promise<boolean>
  isServerStarting: () => Promise<boolean>
  onServerStatusChange: (
    callback: (event: any, data: { status: string; message: string }) => void
  ) => () => void
  onQuitBlocked: (
    callback: (event: any, data: { message: string }) => void
  ) => () => void
  readHtmlFile: (filePath: string) => Promise<string>
  readLogFile: (filePath: string) => Promise<string>
  getAppVersion: () => Promise<string>
  checkForUpdatesManual: () => Promise<{
    status: string
    message: string
    currentVersion?: string
    latestVersion?: string
  }>
  getUpdateInfo: () => Promise<{
    currentVersion: string
    autoDownload: boolean
    autoInstallOnAppQuit: boolean
  }>
  onUpdateStatus: (
    callback: (
      event: any,
      data: {
        status: string
        message: string
        version?: string
        percent?: number
      }
    ) => void
  ) => () => void
  // Auth token management
  storeAuthToken: (token: string) => Promise<void>
  getAuthToken: () => Promise<string | null>
  clearAuthToken: () => Promise<void>
  startFileWatcher: (folderPath: string) => Promise<{ success: boolean; message: string }>
  stopFileWatcher: () => Promise<{ success: boolean; message: string }>
  getWatcherStatus: () => Promise<{
    isWatching: boolean
    watchPath: string | null
    eventCount: number
  }>
  getRecentEvents: (limit?: number) => Promise<FileChangeEvent[]>
  clearWatcherEvents: () => Promise<void>
  onFileWatcherEvent: (callback: (event: any, data: FileChangeEvent) => void) => () => void
  onFileWatcherError: (callback: (event: any, message: string) => void) => () => void
  qc: {
    getRecords: (filters?: any, limit?: number, offset?: number) => Promise<any>
    getRecord: (qcId: string) => Promise<any>
    getStats: () => Promise<any>
    getConfig: () => Promise<any>
    updateConfig: (updates: any) => Promise<any>
    addWatchFolder: (folder: string) => Promise<any>
    removeWatchFolder: (folder: string) => Promise<any>
    testConnection: () => Promise<any>
    getWatcherStatus: () => Promise<any>
    startWatcher: () => Promise<any>
    stopWatcher: () => Promise<any>
    deleteRecord: (qcId: string) => Promise<any>
    deleteAllRecords: () => Promise<any>
    retryRecord: (qcId: string) => Promise<any>
    uploadPdfForRecord: (qcId: string, pdfPath: string) => Promise<any>
    convertReportToDocx: (qcId: string) => Promise<any>
    getBatches: (statusFilter?: string[]) => Promise<any>
    retryBatch: (batchId: string) => Promise<any>
    getBatchFiles: (batchId: string) => Promise<any>
    onFileDetected: (callback: (event: any, data: any) => void) => () => void
    onStatusUpdate: (callback: (event: any, data: any) => void) => () => void
    onQueueUpdate: (callback: (event: any, data: any) => void) => () => void
    onError: (callback: (event: any, data: any) => void) => () => void
  }
  numbering: {
    validate: (questionsPath: string, solutionsPath: string, expectedCount?: number) => Promise<any>
  }
  shell: {
    openPath: (path: string) => Promise<string>
  }
  dialog: {
    showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>
    showSaveDialog: (options: any) => Promise<{ canceled: boolean; filePath?: string }>
  }
  file: {
    copy: (sourcePath: string, destPath: string) => Promise<{ success: boolean; error?: string }>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
