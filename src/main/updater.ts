import { autoUpdater } from 'electron-updater'
import { BrowserWindow, app } from 'electron'

// Update state machine
type UpdateState =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'no-update'
  | 'error'

interface UpdateStatus {
  state: UpdateState
  message: string
  version?: string
  percent?: number
  error?: string
}

let currentState: UpdateState = 'idle'
let mainWindowRef: BrowserWindow | null = null
let updateResolve: (() => void) | null = null
let isUpdateDownloaded = false

// State transition function
function transitionTo(newState: UpdateState, status: UpdateStatus): void {
  console.log(`[Updater] State transition: ${currentState} → ${newState}`)
  currentState = newState

  // Send status to renderer
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('update-status', {
      status: newState,
      ...status
    })
  }

  // Resolve promise for non-blocking states
  if ((newState === 'no-update' || newState === 'error') && updateResolve) {
    console.log(`[Updater] Resolving promise - proceeding to server start`)
    const resolve = updateResolve
    updateResolve = null
    resolve()
  }
}

// Configure auto-updater settings
function configureAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false // We handle installation manually
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
}

// Setup all event listeners
function setupEventListeners(): void {
  // Checking for updates
  autoUpdater.on('checking-for-update', () => {
    transitionTo('checking', {
      state: 'checking',
      message: 'Checking for updates...'
    })
  })

  // Update available - will auto-download
  autoUpdater.on('update-available', (info) => {
    transitionTo('downloading', {
      state: 'downloading',
      message: `Downloading update ${info.version}...`,
      version: info.version,
      percent: 0
    })
  })

  // No update available
  autoUpdater.on('update-not-available', () => {
    transitionTo('no-update', {
      state: 'no-update',
      message: 'App is up to date'
    })
  })

  // Download progress
  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent)
    
    if (currentState !== 'downloading') {
      transitionTo('downloading', {
        state: 'downloading',
        message: `Downloading update... ${percent}%`,
        percent
      })
    } else {
      // Just update the UI, don't transition state
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send('update-status', {
          status: 'downloading',
          state: 'downloading',
          message: `Downloading update... ${percent}%`,
          percent
        })
      }
    }
  })

  // Update downloaded - ready to install
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[Updater] Update ${info.version} downloaded - ready to install`)
    isUpdateDownloaded = true
    
    transitionTo('downloaded', {
      state: 'downloaded',
      message: `Update ${info.version} ready to install`,
      version: info.version
    })

    // Show installing message and quit to install
    setTimeout(() => {
      transitionTo('installing', {
        state: 'installing',
        message: 'Installing update and restarting...',
        version: info.version
      })

      // Give user time to see the installing state (3 seconds)
      setTimeout(() => {
        console.log('[Updater] Installing update and restarting app...')
        // isSilent = true (no installer UI), isForceRunAfter = true (restart app)
        autoUpdater.quitAndInstall(true, true)
      }, 3000)
    }, 1000)
  })

  // Error during update
  autoUpdater.on('error', (error) => {
    console.error('[Updater] Error:', error.message)
    transitionTo('error', {
      state: 'error',
      message: 'Update check failed',
      error: error.message
    })
  })
}

// Check for updates
async function checkForUpdates(): Promise<void> {
  return new Promise((resolve) => {
    if (currentState !== 'idle') {
      console.warn(`[Updater] Already in state: ${currentState}`)
      resolve()
      return
    }

    updateResolve = resolve

    // Set timeout to force resolve if update takes too long
    const timeout = setTimeout(() => {
      if (currentState === 'checking' || currentState === 'downloading') {
        console.warn('[Updater] Update check timeout - proceeding anyway')
        if (updateResolve) {
          const resolve = updateResolve
          updateResolve = null
          resolve()
        }
      }
    }, 30000) // 30 second timeout

    // Clear timeout when resolved
    const originalResolve = updateResolve
    updateResolve = () => {
      clearTimeout(timeout)
      if (originalResolve) originalResolve()
    }

    // Start checking
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[Updater] Failed to check for updates:', err)
      clearTimeout(timeout)
      transitionTo('error', {
        state: 'error',
        message: 'Failed to check for updates',
        error: err.message
      })
    })
  })
}

// Main setup function
export function setupAutoUpdater(mainWindow: BrowserWindow | null): Promise<void> {
  return new Promise((resolve) => {
    mainWindowRef = mainWindow

    // Skip in development
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
      console.log('[Updater] Running in dev mode - updates disabled')
      resolve()
      return
    }

    // Skip on first run after update (Squirrel event)
    if (process.argv.includes('--squirrel-firstrun')) {
      console.log('[Updater] First run after update - skipping update check')
      resolve()
      return
    }

    // Configure and setup
    configureAutoUpdater()
    setupEventListeners()

    // Check for updates
    console.log('[Updater] Starting update check...')
    checkForUpdates()
      .then(() => {
        console.log('[Updater] Update check complete - proceeding to server start')
        resolve()
      })
      .catch((err) => {
        console.error('[Updater] Update check failed:', err)
        resolve() // Always resolve to allow app to continue
      })
  })
}

// Get current update state
export function getUpdateState(): UpdateState {
  return currentState
}

// Check if update is downloaded and ready
export function isUpdateReady(): boolean {
  return isUpdateDownloaded
}

// Reset state (for testing)
export function resetUpdateState(): void {
  currentState = 'idle'
  isUpdateDownloaded = false
  updateResolve = null
}
