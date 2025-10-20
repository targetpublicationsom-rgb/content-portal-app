import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { PythonServerManager } from './python-server-manager'

// Disable GPU cache in development to prevent cache errors
if (is.dev) {
  app.commandLine.appendSwitch('disable-http-cache')
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
}

// Initialize Python server manager
const serverManager = new PythonServerManager()

// Global references
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function createTray(): void {
  // Create tray icon
  const trayIcon = nativeImage.createFromPath(icon)
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
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
        // Stop Python server before quitting
        console.log('[Main] Quitting from tray - stopping Python server...')
        await serverManager.stopServer()
        app.quit()
      }
    }
  ])

  tray.setToolTip('Content Portal')
  tray.setContextMenu(contextMenu)

  // Double-click to show window
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false // Disable web security to allow localhost API calls
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      console.log('[Main] Window hidden to tray')
    }
    return false
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC handlers for server info
  ipcMain.handle('get-server-info-path', () => {
    return serverManager.getServerInfoPath()
  })

  ipcMain.handle('get-server-info', () => {
    return serverManager.getServerInfo()
  })

  ipcMain.handle('is-server-running', () => {
    return serverManager.isRunning()
  })

  // Start Python server before creating window
  try {
    console.log('[Main] Starting Python server...')
    await serverManager.startServer()
    console.log('[Main] Python server started successfully')
  } catch (error) {
    console.error('[Main] Failed to start Python server:', error)
    // Show error dialog but continue - let renderer handle the error
    // You could also choose to quit the app here if the server is critical
  }

  // Create system tray
  createTray()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// On Windows/Linux, keep app running in tray even when all windows are closed
// On macOS, quit when all windows are closed (unless in tray)
app.on('window-all-closed', () => {
  // Don't quit - app stays in tray
  // Python server keeps running
  console.log('[Main] All windows closed - app remains in tray')
  // On macOS, respect the platform convention
  if (process.platform === 'darwin' && isQuitting) {
    app.quit()
  }
})

// Handle app quit - ensure Python server is stopped
app.on('before-quit', async (event) => {
  if (!isQuitting) {
    isQuitting = true
  }

  if (serverManager.isRunning()) {
    console.log('[Main] Stopping Python server before quit...')
    event.preventDefault()
    await serverManager.stopServer()
    console.log('[Main] Python server stopped')
    app.quit()
  }
})
