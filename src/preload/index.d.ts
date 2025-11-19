import { ElectronAPI } from '@electron-toolkit/preload'

interface ServerInfo {
  port: number
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
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
