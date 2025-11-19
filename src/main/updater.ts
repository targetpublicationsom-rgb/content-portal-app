import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'

export function setupAutoUpdater(mainWindow: BrowserWindow | null): Promise<void> {
  return new Promise((resolve) => {
    // Don't check for updates in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Updater] Skipping update check in development mode')
      resolve()
      return
    }

    // Configure auto-updater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false // Don't auto-install, let user decide

    autoUpdater.on('checking-for-update', () => {
      console.log('[Updater] Checking for updates...')
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', {
          status: 'checking',
          message: 'Checking for updates...'
        })
      }
    })

    autoUpdater.on('update-available', (info) => {
      console.log('[Updater] Update available:', info.version, '- downloading...')
      if (mainWindow && !mainWindow.isDestroyed()) {
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', {
          status: 'downloading',
          message: `Downloading update... ${percent}%`,
          percent
        })
      }
    })

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[Updater] Update downloaded:', info.version, '- restarting to install')
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', {
          status: 'installing',
          message: 'Installing update and restarting...',
          version: info.version
        })
      }

      // Wait a moment for the message to display, then restart
      setTimeout(() => {
        autoUpdater.quitAndInstall(false, true)
      }, 1000)
    })

    autoUpdater.on('error', (err) => {
      console.error('[Updater] Error:', err, '- proceeding to start server anyway')
      resolve() // Continue even if update check fails
    })

    // Start the update check
    console.log('[Updater] Starting update check...')
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[Updater] Check failed:', err, '- proceeding to start server')
      resolve()
    })
  })
}
