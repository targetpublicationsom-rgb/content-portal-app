import { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain } from 'electron'
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
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
function startPythonServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const pythonDir = path.join(process.cwd(), 'content-orchestration-service')

    console.log(`[Main] Starting Python server in: ${pythonDir}`)
    console.log('[Main] Command: python -m orchestrator.server')

    serverProcess = spawn('python', ['-m', 'orchestrator.server'], {
      cwd: pythonDir, // ✅ use specific directory
      shell: true,
      detached: false,
    })

    serverRunning = true

    serverProcess.stdout.on('data', (data) => {
      const message = data.toString().trim()
      console.log(`[Python STDOUT]: ${message}`)

      // Optional: detect startup message
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

      // ⚠️ Restart automatically if Electron app is still running
      if (!isQuitting) {
        console.log('[Main] Server closed unexpectedly — restarting...')
        startPythonServer().catch((err) =>
          console.error('[Main] Failed to restart Python server:', err)
        )
      }
    })

    // Safety fallback in case server doesn’t print “ready” line
    setTimeout(() => resolve(), 3000)
  })
}

// --- 🧹 Stop Python Server ---
async function stopPythonServer(): Promise<void> {
  if (serverProcess && serverRunning) {
    console.log('[Main] Stopping Python server...')
    try {
      serverProcess.kill('SIGTERM')
    } catch (err) {
      console.warn('[Main] Error while stopping server:', err)
    }
    serverRunning = false
    serverProcess = null
  }
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
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
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
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// --- 🚀 App Ready ---
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Start server before creating UI
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
  if (!isQuitting) {
    isQuitting = true
  }

  if (serverRunning) {
    console.log('[Main] Stopping Python server before quit...')
    event.preventDefault()
    await stopPythonServer()
    console.log('[Main] Python server stopped')
    app.quit()
  }
})

ipcMain.handle('get-server-info', () => {
  try {
    // Get the AppData/Roaming path (cross-platform safe)
    const appDataDir = app.getPath('appData') // e.g. C:\Users\<user>\AppData\Roaming
    const filePath = path.join(appDataDir, 'TargetPublications', 'target-content', 'last_port.json')
    // Read and parse the JSON file
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)
      console.log(data)
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

// --- IPC handlers for Renderer communication ---
ipcMain.handle('is-server-running', () => {
  return serverRunning
})
