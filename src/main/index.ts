import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  shell,
  nativeImage,
  ipcMain,
  globalShortcut,
  safeStorage,
  dialog
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import { pathToFileURL } from 'url'
import icon from '../../resources/icon.png?asset'
import path from 'path'
import { setupAutoUpdater, isUpdateReady } from './updater'
import { execSync } from 'child_process'
import {
  initializeServerManager,
  startServer,
  stopServer,
  setQuitting,
  isServerRunning,
  isServerStarting,
  getServerPort
} from './serverManager'
import { initializeQCOrchestrator, shutdownQCOrchestrator } from './qc/qcOrchestrator'
import { registerQCIpcHandlers, unregisterQCIpcHandlers } from './qc/qcIpcHandlers'
import { registerNumberingIpcHandlers, unregisterNumberingIpcHandlers } from './numberingIpcHandlers'


let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const DEFAULT_PORT = 6284
const TOKEN_FILE = join(app.getPath('userData'), 'auth-token.enc')

// Handle single instance - prevent multiple instances from running
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
}

// Server functions now handled by serverManager.ts

// --- 🔍 Check for Running Jobs ---
async function checkForRunningJobs(): Promise<boolean> {
  try {
    // Get the actual server port
    const serverPort = getServerPort()

    // Only use the configured server port
    try {
      const response = await fetch(`http://127.0.0.1:${serverPort}/dashboard/jobs?limit=30`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      })

      if (response.ok) {
        const data = await response.json()

        // Check if there are any running jobs (API returns jobs in 'items' array)
        if (data.items && Array.isArray(data.items)) {
          const runningJobs = data.items.filter(
            (job) =>
              job.state === 'RUNNING' || job.state === 'PENDING' || job.state === 'PROCESSING'
          )

          if (runningJobs.length > 0) {
            return true // Has running jobs
          }
        }

        return false // No running jobs
      }
    } catch {
      // Failed to check jobs on this port
    }

    // If we can't reach the server, assume no running jobs (server might be down)
    return false
  } catch {
    return false // Allow quit if we can't check
  }
}

// Server stop function now handled by serverManager.ts

// --- 🪟 Create Window ---
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280, // greater than 900
    height: 800, // greater than 670
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    // Check if app should start minimized (can be configured later)
    const startMinimized =
      process.argv.includes('--start-minimized') || process.argv.includes('--hidden')

    if (startMinimized) {
      // Don't show the window, just keep it ready
    } else {
      mainWindow?.maximize()
      mainWindow?.show()
    }
  })

  mainWindow.on('close', (event) => {
    // Don't minimize to tray if app is quitting (server stopped)
    if (isServerRunning() || isServerStarting()) {
      event.preventDefault()
      mainWindow?.hide()

      // Show tray notification on first hide (Windows only)
      if (process.platform === 'win32' && tray) {
        tray.displayBalloon({
          title: 'Content Portal',
          content: 'Application was minimized to tray. Click the tray icon to restore.'
        })
      }
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Enhanced error handling for renderer loading
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(
      `[Main] Failed to load renderer: ${errorDescription} (${errorCode}) - URL: ${validatedURL} ${event}`
    )
  })

  // Load the renderer content
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    // Development: load from Vite dev server
    console.log('[Main] Loading renderer from dev server:', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']).catch((err) => {
      console.error('[Main] Failed to load dev server:', err)
    })
  } else {
    // Production: load from built files
    // In production, files are in app.asar/dist/renderer/ or out/renderer/
    let rendererPath = join(__dirname, '../renderer/index.html')

    // Check if the default path exists
    if (!fs.existsSync(rendererPath)) {
      // Try alternative paths
      const alternatives = [
        join(process.resourcesPath, 'app.asar', 'dist', 'renderer', 'index.html'),
        join(process.resourcesPath, 'app.asar', 'out', 'renderer', 'index.html'),
        join(__dirname, '../../dist/renderer/index.html'),
        join(__dirname, '../../out/renderer/index.html')
      ]

      for (const altPath of alternatives) {
        if (fs.existsSync(altPath)) {
          rendererPath = altPath
          break
        }
      }
    }

    console.log('[Main] Loading renderer from file:', rendererPath)

    // Check if the file exists before trying to load it
    if (fs.existsSync(rendererPath)) {
      // Use loadFile for cross-platform compatibility
      mainWindow.loadFile(rendererPath).catch((err) => {
        console.error('[Main] Failed to load renderer file:', err)
        // Fallback: try with file URL
        const fileUrl = pathToFileURL(rendererPath).href
        console.log('[Main] Attempting fallback with file URL:', fileUrl)
        mainWindow?.loadURL(fileUrl)
      })
    } else {
      console.error('[Main] Renderer file not found:', rendererPath)
      // Try alternative path (in case of different build output)
      const altPath = join(
        process.resourcesPath,
        'app.asar.unpacked',
        'dist',
        'renderer',
        'index.html'
      )
      if (fs.existsSync(altPath)) {
        console.log('[Main] Using alternative renderer path:', altPath)
        mainWindow.loadFile(altPath)
      }
    }
  }
}

// --- 🧭 Create Tray ---
function createTray(): void {
  try {
    let trayIcon: Electron.NativeImage

    if (is.dev) {
      // Development mode - use icon from resources
      const trayIconPath = path.join(process.cwd(), 'resources', 'icon.png')
      console.log('[Main] Dev mode tray icon path:', trayIconPath)

      if (fs.existsSync(trayIconPath)) {
        trayIcon = nativeImage.createFromPath(trayIconPath)
      } else {
        console.warn('[Main] Dev icon not found, using imported icon')
        trayIcon = nativeImage.createFromPath(icon)
      }
    } else {
      // Prefer ICO format on Windows for better system tray compatibility
      const iconFormats =
        process.platform === 'win32' ? ['icon.ico', 'icon.png'] : ['icon.png', 'icon.ico']

      const possiblePaths: string[] = []
      for (const format of iconFormats) {
        possiblePaths.push(
          // Standard Electron app locations
          path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', format),
          path.join(process.resourcesPath, 'resources', format),
          path.join(process.resourcesPath, format),
          // Build resources (for ICO files)
          path.join(process.resourcesPath, 'app.asar.unpacked', 'build', format),
          path.join(process.resourcesPath, 'build', format),
          // Alternative build locations
          path.join(__dirname, '../../resources/', format),
          path.join(__dirname, '../resources/', format),
          path.join(__dirname, '../../build/', format),
          path.join(__dirname, '../build/', format),
          path.join(path.dirname(process.execPath), 'resources', format),
          // App installation directory
          path.join(path.dirname(process.execPath), '..', 'resources', format),
          path.join(path.dirname(process.execPath), '..', 'build', format)
        )
      }

      let foundPath: string | null = null
      for (const iconPath of possiblePaths) {
        console.log(
          '[Main] Checking tray icon path:',
          iconPath,
          '- exists:',
          fs.existsSync(iconPath)
        )
        if (fs.existsSync(iconPath)) {
          foundPath = iconPath
          break
        }
      }

      if (foundPath) {
        console.log('[Main] Using found tray icon path:', foundPath)
        trayIcon = nativeImage.createFromPath(foundPath)

        // Validate the loaded icon
        console.log('[Main] Loaded icon - Empty?', trayIcon.isEmpty(), 'Size:', trayIcon.getSize())

        // If the icon appears to be invalid, try alternative loading
        if (
          trayIcon.isEmpty() ||
          trayIcon.getSize().width === 0 ||
          trayIcon.getSize().height === 0
        ) {
          console.warn('[Main] Icon appears invalid, trying to load as buffer')
          try {
            const iconBuffer = fs.readFileSync(foundPath)
            trayIcon = nativeImage.createFromBuffer(iconBuffer)
            console.log(
              '[Main] Buffer-loaded icon - Empty?',
              trayIcon.isEmpty(),
              'Size:',
              trayIcon.getSize()
            )
          } catch (bufferError) {
            console.error('[Main] Failed to load icon as buffer:', bufferError)
          }
        }
      } else {
        console.log('[Main] No icon file found in production, using imported icon')
        console.log('[Main] Imported icon value:', icon)

        // The imported icon should be a resolved path in production
        if (typeof icon === 'string') {
          trayIcon = nativeImage.createFromPath(icon)

          // Also validate the imported icon
          if (trayIcon.isEmpty()) {
            console.warn('[Main] Imported icon is empty, trying buffer approach')
            try {
              const iconBuffer = fs.readFileSync(icon)
              trayIcon = nativeImage.createFromBuffer(iconBuffer)
            } catch (bufferError) {
              console.error('[Main] Failed to load imported icon as buffer:', bufferError)
            }
          }
        } else {
          // If icon is not a string, create empty and handle in fallback
          trayIcon = nativeImage.createEmpty()
        }
      }
    }

    // Validate the icon was created successfully
    if (trayIcon.isEmpty()) {
      console.error('[Main] Tray icon is empty, trying alternative approach')
      // If all else fails, try using the imported icon directly
      try {
        if (typeof icon === 'string') {
          trayIcon = nativeImage.createFromPath(icon)
        }

        // If still empty, create a simple fallback
        if (trayIcon.isEmpty()) {
          console.warn('[Main] Creating minimal fallback tray icon')
          // Create a simple 16x16 white square as absolute fallback
          const size = 16
          const buffer = Buffer.alloc(size * size * 4, 255) // RGBA white
          trayIcon = nativeImage.createFromBuffer(buffer, { width: size, height: size })
        }
      } catch (error) {
        console.error('[Main] Failed to create fallback icon:', error)
        // If everything fails, try creating empty and let system handle it
        trayIcon = nativeImage.createEmpty()
      }
    }

    // Resize for system tray (Windows needs 16x16)
    if (process.platform === 'win32') {
      trayIcon = trayIcon.resize({ width: 16, height: 16 })
    }

    console.log(
      '[Main] Creating tray with icon. Empty?',
      trayIcon.isEmpty(),
      'Size:',
      trayIcon.getSize()
    )

    // Create tray with the icon
    tray = new Tray(trayIcon)

    if (tray.isDestroyed()) {
      console.error('[Main] Failed to create tray')
      return
    }

    const menu = Menu.buildFromTemplate([
      {
        label: 'Show Content Portal',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Hide to Tray',
        click: () => {
          mainWindow?.hide()
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit Content Portal',
        click: async () => {
          console.log('[Main] Quit requested from tray...')

          // Check if there are running jobs
          const hasRunningJobs = await checkForRunningJobs()

          if (hasRunningJobs) {
            console.log('[Main] Blocking quit - running jobs detected')

            // Show toast notification
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('show-quit-blocked-toast', {
                message:
                  "Can't quit - jobs are still running. Please wait for jobs to finish or check the Jobs tab."
              })

              // Show the main window if it's hidden so user can see the toast
              if (!mainWindow.isVisible()) {
                mainWindow.show()
              }
              if (mainWindow.isMinimized()) {
                mainWindow.restore()
              }
              mainWindow.focus()
            }

            // Also show system tray balloon if possible
            if (tray && process.platform === 'win32') {
              tray.displayBalloon({
                title: 'Content Portal',
                content: "Can't quit - jobs are still running. Check the Jobs tab for details."
              })
            }

            return // Don't quit
          }

          // No running jobs, proceed with quit
          console.log('[Main] No running jobs, proceeding with quit...')
          setQuitting(true)
          await stopServer()
          app.quit()
        }
      }
    ])

    tray.setToolTip('Content Portal - Content Processing Application')
    tray.setContextMenu(menu)

    // Handle tray click events
    tray.on('click', () => {
      // Single click to show/hide (Windows behavior)
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide()
        } else {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
        }
      }
    })

    tray.on('double-click', () => {
      // Double click to show and focus
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
      }
    })

    console.log('[Main] System tray created successfully')

    // Optional: Show a notification that tray is ready (only on first run)
    if (process.platform === 'win32') {
      setTimeout(() => {
        tray?.displayBalloon({
          title: 'Content Portal',
          content: 'Application is running in the system tray'
        })
      }, 2000)
    }
  } catch (error) {
    console.error('[Main] Failed to create system tray:', error)
  }
}

// --- 🚀 App Ready ---
// Handle HTML file reading
ipcMain.handle('read-html-file', async (_, filePath: string) => {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8')
    return content
  } catch (error) {
    console.error('Error reading HTML file:', error)
    throw error
  }
})

// Handle log file reading
ipcMain.handle('read-log-file', async (_, filePath: string) => {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8')
    return content
  } catch (error) {
    console.error('Error reading log file:', error)
    throw error
  }
})

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.targetpublications.contentportal')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register global shortcut to toggle DevTools (Ctrl+Shift+I)
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow.webContents.openDevTools()
      }
    }
  })

  // Register F12 for DevTools as well
  globalShortcut.register('F12', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow.webContents.openDevTools()
      }
    }
  })

  // Create tray first to ensure it's available
  createTray()

  // Register QC IPC handlers once at startup
  registerQCIpcHandlers()
  console.log('[Main] QC IPC handlers registered')

  // Register Numbering Checker IPC handlers
  registerNumberingIpcHandlers()
  console.log('[Main] Numbering Checker IPC handlers registered')


  // Then create window
  createWindow()

  // Initialize server manager
  if (mainWindow) {
    initializeServerManager(mainWindow)
  }

  // Wait for window to be ready, then check for updates, then start server
  mainWindow?.webContents.once('did-finish-load', async () => {
    console.log('[Main] ===== App Startup Flow =====')
    console.log('[Main] Step 1: Window loaded')

    try {
      // Step 2: Check for updates
      console.log('[Main] Step 2: Checking for updates...')
      await setupAutoUpdater(mainWindow)
      console.log('[Main] Step 2: Update check complete')
    } catch (err) {
      console.error('[Main] Step 2: Update check failed:', err)
    }

    // Step 2.5: Initialize QC orchestrator
    try {
      console.log('[Main] Step 2.5: Initializing QC orchestrator...')
      await initializeQCOrchestrator(mainWindow!)
      console.log('[Main] Step 2.5: QC orchestrator initialized')
    } catch (err) {
      console.error('[Main] Step 2.5: QC orchestrator initialization failed:', err)
    }

    // Step 3: Start server (with built-in retry logic)
    console.log('[Main] Step 3: Starting server...')
    try {
      await startServer()
      console.log('[Main] Step 3: Server started successfully')
      console.log('[Main] ===== App Ready =====')
    } catch (err) {
      console.error('[Main] Step 3: Server start failed:', err)
    }
  })
})

// --- 🧩 Keep app running in tray ---
app.on('window-all-closed', () => {
  console.log('[Main] All windows closed — app remains running in tray')
})

// --- 🧨 Graceful Quit ---
app.on('before-quit', async (event) => {
  // Allow immediate quit if update is being installed
  if (isUpdateReady()) {
    console.log('[Main] Update installation - allowing immediate quit')
    setQuitting(true)
    return
  }

  event.preventDefault()
  console.log('[Main] Stopping server before quit...')
  setQuitting(true)

  // Shutdown QC orchestrator
  try {
    console.log('[Main] Shutting down QC orchestrator...')
    await shutdownQCOrchestrator()
    console.log('[Main] QC orchestrator shutdown complete')
  } catch (err) {
    console.error('[Main] QC orchestrator shutdown failed:', err)
  }

  await stopServer()

  // Clean up tray
  if (tray) {
    tray.destroy()
    tray = null
  }

  console.log('[Main] Server stopped - exiting app')
  app.exit(0)
})

// --- 🔄 Final cleanup on quit ---
app.on('will-quit', async () => {
  console.log('[Main] App is about to quit - final cleanup')

  // Unregister all shortcuts
  globalShortcut.unregisterAll()

  // Unregister QC IPC handlers
  unregisterQCIpcHandlers()

  // Unregister Numbering Checker IPC handlers
  unregisterNumberingIpcHandlers()


  // Ensure server is stopped
  setQuitting(true)

  // Final attempt to kill any remaining content-orchestrator processes
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /IM "content-orchestrator.exe" /F', { timeout: 3000 })
      // console.log('[Main] Final cleanup: killed remaining content-orchestrator processes')
    } catch {
      // No processes found or already cleaned up
      console.log('[Main] Final cleanup: no content-orchestrator processes to clean up')
    }
  }
})

// --- IPC handlers ---
ipcMain.handle('get-server-info', () => {
  try {
    const appDataDir = app.getPath('appData')
    const filePath = path.join(appDataDir, 'TargetPublications', 'target-content', 'last_port.json')
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      // console.log('[Main] Loaded server info:', data)
      return data
    } else {
      console.warn('[Main] Server info file not found:', filePath)
      return { port: DEFAULT_PORT }
    }
  } catch (error) {
    console.error('[Main] Error reading server info:', error)
    return null
  }
})

ipcMain.handle('is-server-running', () => isServerRunning())
ipcMain.handle('is-server-starting', () => isServerStarting())
ipcMain.handle('get-app-data-path', () => app.getPath('appData'))

// Auth token management IPC handlers
ipcMain.handle('store-auth-token', async (_event, token: string) => {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token)
      fs.writeFileSync(TOKEN_FILE, encrypted)
      console.log('[Main] Auth token stored securely')
    } else {
      // Fallback: store as base64 (less secure but works everywhere)
      const encoded = Buffer.from(token).toString('base64')
      fs.writeFileSync(TOKEN_FILE, encoded)
      console.log('[Main] Auth token stored (fallback mode)')
    }
  } catch (error) {
    console.error('[Main] Failed to store auth token:', error)
    throw error
  }
})

ipcMain.handle('get-auth-token', async () => {
  try {
    if (!fs.existsSync(TOKEN_FILE)) {
      return null
    }

    const data = fs.readFileSync(TOKEN_FILE)

    if (safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(data)
      return decrypted
    } else {
      // Fallback: decode from base64
      const decoded = Buffer.from(data.toString(), 'base64').toString('utf-8')
      return decoded
    }
  } catch (error) {
    console.error('[Main] Failed to get auth token:', error)
    return null
  }
})

ipcMain.handle('clear-auth-token', async () => {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE)
      console.log('[Main] Auth token cleared')
    }
  } catch (error) {
    console.error('[Main] Failed to clear auth token:', error)
  }
})
ipcMain.handle('get-app-version', () => app.getVersion())

// Shell and dialog IPC handlers
ipcMain.handle('shell:open-path', async (_, path: string) => {
  return await shell.openPath(path)
})

ipcMain.handle('dialog:show-open-dialog', async (_, options: Electron.OpenDialogOptions) => {
  if (mainWindow) {
    return await dialog.showOpenDialog(mainWindow, options)
  }
  return { canceled: true, filePaths: [] }
})
