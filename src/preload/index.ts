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

  // File Watcher APIs
  startFileWatcher: (folderPath: string): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('start-file-watcher', folderPath),

  stopFileWatcher: (): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('stop-file-watcher'),

  getWatcherStatus: (): Promise<{
    isWatching: boolean
    watchPath: string | null
    eventCount: number
  }> => ipcRenderer.invoke('get-watcher-status'),

  getRecentEvents: (
    limit?: number
  ): Promise<
    Array<{
      type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
      path: string
      filename: string
      timestamp: string
    }>
  > => ipcRenderer.invoke('get-recent-events', limit),

  clearWatcherEvents: (): Promise<void> => ipcRenderer.invoke('clear-watcher-events'),

  onFileWatcherEvent: (
    callback: (
      event: any,
      data: {
        type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
        path: string
        filename: string
        timestamp: string
      }
    ) => void
  ) => {
    ipcRenderer.on('file-watcher-event', callback)
    return () => ipcRenderer.removeListener('file-watcher-event', callback)
  },

  onFileWatcherError: (callback: (event: any, message: string) => void) => {
    ipcRenderer.on('file-watcher-error', callback)
    return () => ipcRenderer.removeListener('file-watcher-error', callback)
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
