import { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain } from 'electron'
import { spawn, execSync, ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import path from 'path'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let serverProcess: ChildProcessWithoutNullStreams | null = null
let serverRunning = false
let isQuitting = false

// --- 🔥 Start Python Server ---
async function startPythonServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const pythonDir = path.join(process.cwd(), 'content-orchestration-service')
    console.log(`[Main] Starting Python server in: ${pythonDir}`)

    // 🧹 --- Cleanup any existing Python processes ---
    try {
      if (process.platform === 'win32') {
        console.log('[Main] Cleaning up existing Python processes...')
        execSync('taskkill /IM python.exe /F', { stdio: 'ignore' })
      } else {
        console.log('[Main] Cleaning up existing Python processes...')
        execSync('pkill -f "orchestrator.server"', { stdio: 'ignore' })
      }
    } catch {
      // Ignore errors if nothing to kill
    }

    // 🐍 --- Resolve Python executable inside .venv ---
    const pythonExec =
      process.platform === 'win32'
        ? path.join(pythonDir, '.venv', 'Scripts', 'python.exe')
        : path.join(pythonDir, '.venv', 'bin', 'python')

    // Check if venv python exists
    if (!fs.existsSync(pythonExec)) {
      console.error('[Main] Python virtual environment not found:', pythonExec)
      reject(new Error('Python virtual environment missing'))
      return
    }

    console.log(`[Main] Using Python executable: ${pythonExec}`)

    // 🚀 --- Start Python server from .venv ---
    serverProcess = spawn(pythonExec, ['-m', 'orchestrator.server'], {
      cwd: pythonDir,
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    serverRunning = true

    serverProcess.stdout.on('data', (data) => {
      const message = data.toString().trim()
      console.log(`[Python STDOUT]: ${message}`)
      if (message.includes('Running on') || message.includes('Server started')) {
        resolve()
      }
    })

    serverProcess.stderr.on('data', (data) => {
      console.error(`[Python STDERR]: ${data}`)
    })

    serverProcess.on('error', (err) => {
      console.error('[Main] Failed to start Python process:', err)
      serverRunning = false
      reject(err)
    })

    serverProcess.on('close', (code) => {
      console.log(`[Python Server] exited with code ${code}`)
      serverRunning = false
      serverProcess = null

      // ✅ Restart only if not quitting
      if (!isQuitting) {
        console.log('[Main] Server closed unexpectedly — restarting...')
        startPythonServer().catch((err) =>
          console.error('[Main] Failed to restart Python server:', err)
        )
      }
    })

    // Fallback resolve in case server doesn’t print a ready message
    setTimeout(() => resolve(), 3000)
  })
}

// --- 🧹 Stop Python Server ---
async function stopPythonServer(): Promise<void> {
  if (!serverProcess) return
  console.log('[Main] Stopping Python server...')

  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${serverProcess.pid} /T /F`)
    } else {
      process.kill(serverProcess.pid, 'SIGTERM')
    }
  } catch (err) {
    console.warn('[Main] Error while stopping server:', err)
  }

  serverProcess = null
  serverRunning = false
}

// --- 🪟 Create Window ---
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      console.log('[Main] Window hidden to tray')
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// --- 🧭 Create Tray ---
function createTray(): void {
  const trayIcon = nativeImage.createFromPath(icon)
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))

  const menu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    {
      label: 'Quit',
      click: async () => {
        isQuitting = true
        console.log('[Main] Quitting from tray...')
        await stopPythonServer()
        app.quit()
      }
    }
  ])

  tray.setToolTip('Content Portal')
  tray.setContextMenu(menu)

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

// --- 🚀 App Ready ---
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  try {
    await startPythonServer()
    console.log('[Main] Python server started successfully')
  } catch (err) {
    console.error('[Main] Failed to start Python server:', err)
  }

  createTray()
  createWindow()
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
      return { port: 5173 }
    }
  } catch (error) {
    console.error('[Main] Error reading server info:', error)
    return null
  }
})

ipcMain.handle('is-server-running', () => serverRunning)
