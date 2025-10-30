import { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain } from 'electron'
import { spawn, execSync, ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import { pathToFileURL } from 'url'
import icon from '../../resources/icon.png?asset'
import path from 'path'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let serverProcess: ChildProcessWithoutNullStreams | null = null
let serverRunning = false
let serverStarting = false
let isQuitting = false
const DEFAULT_PORT = 6284

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
  return new Promise((resolve, reject) => {
    serverStarting = true
    serverRunning = false

    // Notify renderer about server starting
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-status-change', {
        status: 'starting',
        message: 'Initializing Content Orchestrator...'
      })
    }

    // Use proper path resolution for both development and production
    const executablePath = is.dev
      ? path.join(process.cwd(), 'tools', 'content-orchestrator.exe')
      : path.join(process.resourcesPath, 'app.asar.unpacked', 'tools', 'content-orchestrator.exe')
    console.log(`[Main] Starting Content Orchestrator: ${executablePath}`)
    console.log(`[Main] Is development: ${is.dev}`)
    console.log(`[Main] Resources path: ${process.resourcesPath}`)
    console.log(`[Main] Current working directory: ${process.cwd()}`)

    try {
      if (process.platform === 'win32') {
        console.log('[Main] Cleaning up existing Content Orchestrator processes...')
        execSync('taskkill /IM content-orchestrator.exe /F', { stdio: 'ignore' })
      } else {
        console.log('[Main] Cleaning up existing Content Orchestrator processes...')
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

    console.log(`[Main] Using Content Orchestrator executable: ${executablePath}`)

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
      console.log(`[Orchestrator STDOUT]: ${message}`)
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

// --- 🧹 Stop Content Orchestrator ---
async function stopPythonServer(): Promise<void> {
  if (!serverProcess) return
  console.log('[Main] Stopping Content Orchestrator...')

  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${serverProcess.pid} /T /F`)
    } else {
      if (serverProcess.pid) {
        process.kill(serverProcess.pid, 'SIGTERM')
      }
    }
  } catch (err) {
    console.warn('[Main] Error while stopping Content Orchestrator:', err)
  }

  serverProcess = null
  serverRunning = false
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
    const startMinimized = process.argv.includes('--start-minimized') || process.argv.includes('--hidden')
    
    if (startMinimized) {
      console.log('[Main] Starting minimized to tray')
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
      console.log('[Main] Window hidden to tray')
      
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
    const rendererPath = join(__dirname, '../renderer/index.html')
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
    let trayIconPath: string
    
    if (is.dev) {
      // Development mode - use icon from resources
      trayIconPath = path.join(process.cwd(), 'resources', 'icon.png')
    } else {
      // Production mode - check multiple possible locations
      const possiblePaths = [
        path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'icon.png'),
        path.join(process.resourcesPath, 'icon.png'),
        path.join(__dirname, '../../resources/icon.png'),
        icon // fallback to the imported icon
      ]
      
      trayIconPath = possiblePaths.find((p) => fs.existsSync(p)) || icon
    }
    
    console.log('[Main] Using tray icon path:', trayIconPath)
    
    const trayIcon = nativeImage.createFromPath(trayIconPath)
    
    // Ensure the icon is properly resized for system tray
    const resizedIcon = trayIcon.resize({ width: 16, height: 16 })
    
    // Create tray with the icon, with better error handling
    tray = new Tray(resizedIcon.isEmpty() ? trayIcon : resizedIcon)
    
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
          isQuitting = true
          console.log('[Main] Quitting from tray...')
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

  // Start server after window is created so we can send status updates
  try {
    await startPythonServer()
    console.log('[Main] Python server started successfully')
  } catch (err) {
    console.error('[Main] Failed to start Python server:', err)
  }
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
  
  console.log('[Main] Python server stopped')
  app.quit()
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
