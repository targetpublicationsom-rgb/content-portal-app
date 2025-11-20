import { autoUpdater } from 'electron-updater'
import { BrowserWindow, app } from 'electron'

let currentUpdateStatus: {
  status: string
  message: string
  version?: string
  percent?: number
} | null = null


// Get current update status (can be called from renderer)
export function getCurrentUpdateStatus(): typeof currentUpdateStatus {
  return currentUpdateStatus
}

export function setupAutoUpdater(mainWindow: BrowserWindow | null): Promise<void> {
  return new Promise((resolve) => {
    // Force dev update config in development
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
      autoUpdater.forceDevUpdateConfig = true
      console.log('[Updater] Running in dev mode - forcing dev update config')
    }

    // Wait for window to be ready before starting update check
    const startUpdateCheck = (): void => {
      console.log('[Updater] Starting update check...')
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('[Updater] Check failed:', err, '- proceeding to start server')
        resolve()
      })
    }

    // If window is ready, start immediately, otherwise wait
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isLoadingMainFrame()) {
      startUpdateCheck()
    } else {
      mainWindow?.webContents.once('did-finish-load', () => {
        console.log('[Updater] Window ready, starting update check')
        setTimeout(startUpdateCheck, 500) // Small delay to ensure renderer is ready
      })
    }

    // Configure auto-updater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true // Install silently when app quits

    autoUpdater.on('checking-for-update', () => {
      console.log('[Updater] Checking for updates...')
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isLoadingMainFrame() === false) {
        mainWindow.webContents.send('update-status', {
          status: 'checking',
          message: 'Checking for updates...'
        })
      }
    })

    autoUpdater.on('update-available', (info) => {
      console.log('[Updater] Update available:', info.version, '- downloading...')
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isLoadingMainFrame() === false) {
        mainWindow.webContents.send('update-status', {
          status: 'downloading',
          message: `Downloading version ${info.version}...`,
          version: info.version
        })
      }
    })

    autoUpdater.on('update-not-available', () => {
      console.log('[Updater] No updates available - proceeding to start server')
      resolve()
    })

    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.round(progress.percent)
      console.log(`[Updater] Download progress: ${percent}%`)
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isLoadingMainFrame() === false) {
        mainWindow.webContents.send('update-status', {
          status: 'downloading',
          message: `Downloading update... ${percent}%`,
          percent
        })
      }
    })

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[Updater] Update downloaded:', info.version, '- restarting to install')
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isLoadingMainFrame() === false) {
        mainWindow.webContents.send('update-status', {
          status: 'installing',
          message: 'Installing update and restarting...',
          version: info.version
        })
      }

      // Wait longer for the UI to show the message
      setTimeout(() => {
        autoUpdater.quitAndInstall(true, true) // true = silent install, true = force run after
      }, 3000) // 3 seconds delay to show the UI
    })

    autoUpdater.on('error', (err) => {
      console.error('[Updater] Error:', err, '- proceeding to start server anyway')
      currentUpdateStatus = null
      resolve() // Continue even if update check fails
    })

    // When renderer is ready, send cached status if any
    if (mainWindow) {
      mainWindow.webContents.on('did-finish-load', () => {
        if (currentUpdateStatus) {
          setTimeout(() => {
            mainWindow.webContents.send('update-status', currentUpdateStatus)
            console.log('[Updater] Re-sent cached update status to renderer')
          }, 100)
        }
      })
    }

    // Don't call checkForUpdates here - it's called in startUpdateCheck
  })
}
