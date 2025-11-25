import chokidar, { FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'

interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
  filename: string
  timestamp: string
}

let watcher: FSWatcher | null = null
let watchPath: string | null = null
let isWatching = false
let mainWindow: BrowserWindow | null = null

// Store recent events (max 100)
const recentEvents: FileChangeEvent[] = []
const MAX_EVENTS = 100

function addEvent(event: FileChangeEvent): void {
  recentEvents.unshift(event)
  if (recentEvents.length > MAX_EVENTS) {
    recentEvents.pop()
  }
  
  // Send event to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('file-watcher-event', event)
  }
}

export function initFileWatcher(window: BrowserWindow): void {
  mainWindow = window
  console.log('[FileWatcher] Initialized')
}

export function startWatching(folderPath: string): { success: boolean; message: string } {
  try {
    // Validate path exists
    if (!fs.existsSync(folderPath)) {
      return { success: false, message: 'Folder does not exist' }
    }

    const stats = fs.statSync(folderPath)
    if (!stats.isDirectory()) {
      return { success: false, message: 'Path is not a directory' }
    }

    // Stop existing watcher if any
    if (watcher) {
      stopWatching()
    }

    watchPath = folderPath

    // Initialize chokidar watcher
    watcher = chokidar.watch(folderPath, {
      persistent: true,
      ignoreInitial: false, // We want to see existing files
      depth: 10, // Watch nested directories
      awaitWriteFinish: {
        stabilityThreshold: 1000, // Wait for file to stabilize
        pollInterval: 100
      },
      // Network drive optimizations
      usePolling: true, // Required for network drives
      interval: 1000, // Poll every second
      binaryInterval: 3000
    })

    // Watch for file/directory additions
    watcher.on('add', (filePath: string) => {
      console.log(`[FileWatcher] File added: ${filePath}`)
      addEvent({
        type: 'add',
        path: filePath,
        filename: path.basename(filePath),
        timestamp: new Date().toISOString()
      })
    })

    // Watch for file changes
    watcher.on('change', (filePath: string) => {
      console.log(`[FileWatcher] File changed: ${filePath}`)
      addEvent({
        type: 'change',
        path: filePath,
        filename: path.basename(filePath),
        timestamp: new Date().toISOString()
      })
    })

    // Watch for file deletions
    watcher.on('unlink', (filePath: string) => {
      console.log(`[FileWatcher] File removed: ${filePath}`)
      addEvent({
        type: 'unlink',
        path: filePath,
        filename: path.basename(filePath),
        timestamp: new Date().toISOString()
      })
    })

    // Watch for directory additions
    watcher.on('addDir', (dirPath: string) => {
      console.log(`[FileWatcher] Directory added: ${dirPath}`)
      addEvent({
        type: 'addDir',
        path: dirPath,
        filename: path.basename(dirPath),
        timestamp: new Date().toISOString()
      })
    })

    // Watch for directory deletions
    watcher.on('unlinkDir', (dirPath: string) => {
      console.log(`[FileWatcher] Directory removed: ${dirPath}`)
      addEvent({
        type: 'unlinkDir',
        path: dirPath,
        filename: path.basename(dirPath),
        timestamp: new Date().toISOString()
      })
    })

    // Error handling
    watcher.on('error', (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[FileWatcher] Error:', error)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file-watcher-error', errorMessage)
      }
    })

    // Ready event
    watcher.on('ready', () => {
      console.log(`[FileWatcher] Ready and watching: ${folderPath}`)
      isWatching = true
    })

    return { success: true, message: `Watching ${folderPath}` }
  } catch (error) {
    console.error('[FileWatcher] Failed to start watching:', error)
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Failed to start watching' 
    }
  }
}

export function stopWatching(): { success: boolean; message: string } {
  try {
    if (watcher) {
      watcher.close()
      watcher = null
      isWatching = false
      watchPath = null
      console.log('[FileWatcher] Stopped watching')
      return { success: true, message: 'Stopped watching' }
    }
    return { success: true, message: 'No active watcher' }
  } catch (error) {
    console.error('[FileWatcher] Failed to stop watching:', error)
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Failed to stop watching' 
    }
  }
}

export function getWatcherStatus(): {
  isWatching: boolean
  watchPath: string | null
  eventCount: number
} {
  return {
    isWatching,
    watchPath,
    eventCount: recentEvents.length
  }
}

export function getRecentEvents(limit = 50): FileChangeEvent[] {
  return recentEvents.slice(0, limit)
}

export function clearEvents(): void {
  recentEvents.length = 0
  console.log('[FileWatcher] Events cleared')
}
