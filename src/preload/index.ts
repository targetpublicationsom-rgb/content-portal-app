import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Get the path to server-info.json
  getServerInfoPath: (): Promise<string> => ipcRenderer.invoke('get-server-info-path'),

  // Get current server info from memory
  getServerInfo: (): Promise<{ port: number } | null> => ipcRenderer.invoke('get-server-info'),

  // Check if server is running
  isServerRunning: (): Promise<boolean> => ipcRenderer.invoke('is-server-running')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
