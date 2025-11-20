import { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain } from 'electron'
import { spawn, execSync, ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import { pathToFileURL } from 'url'
import icon from '../../resources/icon.png?asset'
import path from 'path'
import { setupAutoUpdater, getCurrentUpdateStatus } from './updater'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let serverProcess: ChildProcessWithoutNullStreams | null = null
let serverRunning = false
let serverStarting = false
let isQuitting = false
const DEFAULT_PORT = 6284
let extractedExePath: string | null = null

// Extract exe from ASAR to userData for OTA updates
async function ensureContentOrchestratorExtracted(): Promise<string> {
  const userDataPath = app.getPath('userData')
  const toolsDir = path.join(userDataPath, 'tools')
  const targetExePath = path.join(toolsDir, 'content-orchestrator.exe')
  const versionFile = path.join(toolsDir, 'version.txt')
  const currentVersion = app.getVersion()

  // Check if already extracted and version matches
  if (fs.existsSync(targetExePath) && fs.existsSync(versionFile)) {
    try {
      const extractedVersion = fs.readFileSync(versionFile, 'utf-8').trim()
      if (extractedVersion === currentVersion) {
        console.log('[Main] Content Orchestrator already extracted for version', currentVersion)
        return targetExePath
      }
      console.log('[Main] Version mismatch - re-extracting exe (old:', extractedVersion, 'new:', currentVersion, ')')
    } catch (err) {
      console.log('[Main] Failed to read version file, re-extracting:', err)
    }
  }

  // Create tools directory
  if (!fs.existsSync(toolsDir)) {
    fs.mkdirSync(toolsDir, { recursive: true })
  }

  // Determine source path (ASAR bundled)
  const sourceExePath = is.dev
    ? path.join(process.cwd(), 'tools', 'content-orchestrator.exe')
    : path.join(process.resourcesPath, 'app.asar', 'tools', 'content-orchestrator.exe')

  console.log('[Main] Extracting Content Orchestrator from:', sourceExePath)
  console.log('[Main] Extracting to:', targetExePath)

  try {
    // Copy exe from ASAR to userData
    await fsPromises.copyFile(sourceExePath, targetExePath)
    // Write version file
    fs.writeFileSync(versionFile, currentVersion, 'utf-8')
    console.log('[Main] Content Orchestrator extracted successfully')
    return targetExePath
  } catch (err) {
    console.error('[Main] Failed to extract Content Orchestrator:', err)
    throw err
  }
}

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

async function startPythonServer(): Promise<void> {
  serverStarting = true
  serverRunning = false

  // Notify renderer about server starting
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server-status-change', {
      status: 'starting',
      message: 'Initializing Content Orchestrator...'
    })
  }

  // Extract exe from ASAR if not already extracted
  let executablePath: string
  try {
    executablePath = extractedExePath || (await ensureContentOrchestratorExtracted())
    extractedExePath = executablePath
  } catch (err) {
    console.error('[Main] Failed to extract Content Orchestrator:', err)
    serverStarting = false
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-status-change', {
        status: 'error',
        message: 'Failed to extract Content Orchestrator'
      })
    }
    throw err
  }
  // Starting Content Orchestrator

  return new Promise((resolve, reject) => {

    try {
      if (process.platform === 'win32') {
        execSync('taskkill /IM content-orchestrator.exe /F', { stdio: 'ignore' })
      } else {
        execSync('pkill -f "content-orchestrator"', { stdio: 'ignore' })
      }
    } catch {
      // Ignore errors if nothing to kill
    }

    if (!fs.existsSync(executablePath)) {
      console.error('[Main] Content Orchestrator executable not found:', executablePath)
      serverStarting = false
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-status-change', {
          status: 'error',
          message: 'Content Orchestrator executable not found'
        })
      }
      reject(new Error('Content Orchestrator executable missing'))
      return
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-status-change', {
        status: 'starting',
        message: 'Starting Content Orchestrator process...'
      })
    }

    serverProcess = spawn(executablePath, [], {
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    serverProcess.stdout.on('data', (data) => {
      const message = data.toString().trim()
      if (
        message.includes('Running on') ||
        message.includes('Server started') ||
        message.includes('started')
      ) {
        serverRunning = true
        serverStarting = false
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('server-status-change', {
            status: 'ready',
            message: 'Content Orchestrator is ready!'
          })
        }
        resolve()
      }
    })

    serverProcess.stderr.on('data', (data) => {
      console.error(`[Orchestrator STDERR]: ${data}`)
    })

    serverProcess.on('error', (err) => {
      console.error('[Main] Failed to start Content Orchestrator process:', err)
      serverRunning = false
      serverStarting = false
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-status-change', {
          status: 'error',
          message: `Failed to start server: ${err.message}`
        })
      }
      reject(err)
    })

    serverProcess.on('close', (code) => {
      console.log(`[Content Orchestrator] exited with code ${code}`)
      serverRunning = false
      serverStarting = false
      serverProcess = null

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-status-change', {
          status: 'stopped',
          message: 'Content Orchestrator stopped'
        })
      }

      // ✅ Restart only if not quitting
      if (!isQuitting) {
        console.log('[Main] Content Orchestrator closed unexpectedly — restarting...')
        startPythonServer().catch((err) =>
          console.error('[Main] Failed to restart Content Orchestrator:', err)
        )
      }
    })

    // Fallback resolve in case server doesn't print a ready message
    setTimeout(() => {
      if (serverStarting) {
        serverRunning = true
        serverStarting = false
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('server-status-change', {
            status: 'ready',
            message: 'Content Orchestrator started (timeout)'
          })
        }
        resolve()
      }
    }, 5000)
  })
}

// --- 🔍 Check for Running Jobs ---
async function checkForRunningJobs(): Promise<boolean> {
  try {
    // Get the actual server port from configuration
    let serverPort = DEFAULT_PORT
    try {
      const appDataDir = app.getPath('appData')
      const filePath = path.join(appDataDir, 'TargetPublications', 'target-content', 'last_port.json')
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        serverPort = data.port || DEFAULT_PORT
      }
    } catch {
      // Use default port on error
    }

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

// --- 🧹 Stop Content Orchestrator ---
async function stopPythonServer(): Promise<void> {
  if (!serverProcess) {
    return
  }

  try {
    if (process.platform === 'win32') {
      // Kill the process tree forcefully on Windows
      execSync(`taskkill /PID ${serverProcess.pid} /T /F`, { timeout: 10000 })

      // Also try to kill any remaining content-orchestrator.exe processes
      try {
        execSync('taskkill /IM "content-orchestrator.exe" /F', { timeout: 5000 })
      } catch {
        // Ignore error if no processes found
      }
    } else {
      if (serverProcess.pid) {
        process.kill(serverProcess.pid, 'SIGTERM')

        // Wait a moment then force kill if still running
        setTimeout(() => {
          try {
            if (serverProcess && serverProcess.pid) {
              process.kill(serverProcess.pid, 'SIGKILL')
            }
          } catch {
            // Process already dead
          }
        }, 2000)
      }
    }
  } catch {
    // Even if there's an error, continue with cleanup
  }

  serverProcess = null
  serverRunning = false
  serverStarting = false
}

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
    if (!isQuitting) {
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
          isQuitting = true
          console.log('[Main] No running jobs, proceeding with quit...')
          await stopPythonServer()
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

  // Create tray first to ensure it's available
  createTray()

  // Then create window
  createWindow()

  // Check for updates immediately, before window loads
  // Updates will be shown once window is ready
  await setupAutoUpdater(mainWindow)

  // Wait for window to be ready before starting server
  mainWindow?.webContents.once('did-finish-load', async () => {
    console.log('[Main] Window loaded, starting server...')

    // Start server after update check completes
    try {
      await startPythonServer()
      console.log('[Main] Python server started successfully')
    } catch (err) {
      console.error('[Main] Failed to start Python server:', err)
    }
  })
})

// --- 🧩 Keep app running in tray ---
app.on('window-all-closed', () => {
  console.log('[Main] All windows closed — app remains running in tray')
})

// --- 🧨 Graceful Quit ---
app.on('before-quit', async (event) => {
  if (isQuitting) return

  event.preventDefault()
  isQuitting = true
  console.log('[Main] Stopping Python server before quit...')
  await stopPythonServer()

  // Clean up tray
  if (tray) {
    tray.destroy()
    tray = null
  }

  console.log('[Main] Python server stopped - allowing app to quit')
  // Don't call app.quit() here as it creates a loop - just let the event continue
  isQuitting = false // Reset the flag to allow the quit to proceed naturally
})

// --- 🔄 Final cleanup on quit ---
app.on('will-quit', async () => {
  console.log('[Main] App is about to quit - final cleanup')

  // Final attempt to kill any remaining content-orchestrator processes
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /IM "content-orchestrator.exe" /F', { timeout: 3000 })
      console.log('[Main] Final cleanup: killed remaining content-orchestrator processes')
    } catch (e) {
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
      console.log('[Main] Loaded server info:', data)
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

ipcMain.handle('is-server-running', () => serverRunning)
ipcMain.handle('is-server-starting', () => serverStarting)
ipcMain.handle('get-app-data-path', () => app.getPath('appData'))
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('get-update-status', () => getCurrentUpdateStatus())
