import { ElectronAPI } from '@electron-toolkit/preload'

interface ServerInfo {
  port: number
}

interface API {
  getServerInfoPath: () => Promise<string>
  getServerInfo: () => Promise<ServerInfo | null>
  isServerRunning: () => Promise<boolean>
  readHtmlFile: (filePath: string) => Promise<string>
  readLogFile: (filePath: string) => Promise<string>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
