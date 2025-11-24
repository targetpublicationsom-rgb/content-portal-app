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
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
