import chokidar, { FSWatcher } from 'chokidar'
import * as path from 'path'
import { EventEmitter } from 'events'

export interface WatchEvent {
  type: 'add' | 'change'
  filePath: string
  filename: string
  timestamp: string
}

class QCWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null
  private watchedFolders: string[] = []
  private isWatching = false
  private recentlyProcessedFiles: Map<string, number> = new Map() // Track recently processed files to prevent duplicates
  private readonly DUPLICATE_THRESHOLD_MS = 5000 // 5 seconds

  start(folders: string[]): void {
    if (this.isWatching) {
      console.log('[QCWatcher] Already watching')
      return
    }

    if (folders.length === 0) {
      console.log('[QCWatcher] No folders to watch')
      return
    }

    this.watchedFolders = folders
    this.isWatching = true // Set immediately
    console.log(`[QCWatcher] Starting to watch ${folders.length} folder(s)`)

    this.watcher = chokidar.watch(folders, {
      ignored: [
        /(^|[/\\])\.\../, // Ignore dotfiles
        /~\$.+\.docx$/ // Ignore Word temp files (~$filename.docx)
      ],
      persistent: true,
      ignoreInitial: true, // CHANGED: Only detect NEW files, not existing ones
      awaitWriteFinish: {
        stabilityThreshold: 2000, // Wait 2s after last change
        pollInterval: 100
      },
      usePolling: false, // Use fs.watch for better performance
      depth: 0 // Only watch immediate files, not subdirectories
    })

    this.watcher.on('add', (filePath: string) => {
      this.handleFileAdded(filePath)
    })

    this.watcher.on('error', (err: unknown) => {
      const error = err as Error
      console.error('[QCWatcher] Watcher error:', error)
      this.emit('error', error.message)
    })

    this.watcher.on('ready', () => {
      console.log('[QCWatcher] Ready and watching')
      this.emit('ready')
    })
  }

  stop(): void {
    if (!this.isWatching || !this.watcher) {
      return
    }

    console.log('[QCWatcher] Stopping watcher')
    this.watcher.close()
    this.watcher = null
    this.isWatching = false
    this.watchedFolders = []
    this.emit('stopped')
  }

  private handleFileAdded(filePath: string): void {
    console.log(`[QCWatcher] File event received: ${filePath}`)
    
    // Check if this file was recently processed (within threshold)
    const now = Date.now()
    const lastProcessed = this.recentlyProcessedFiles.get(filePath)
    if (lastProcessed && now - lastProcessed < this.DUPLICATE_THRESHOLD_MS) {
      console.log(`[QCWatcher] Ignoring duplicate event for: ${filePath} (processed ${now - lastProcessed}ms ago)`)
      return
    }
    
    const ext = path.extname(filePath).toLowerCase()
    console.log(`[QCWatcher] File extension: ${ext}`)

    // Only process .docx files
    if (ext !== '.docx') {
      console.log(`[QCWatcher] Ignoring non-docx file: ${filePath}`)
      return
    }

    const filename = path.basename(filePath)

    // Double-check for temp files (should be caught by ignore pattern)
    if (filename.startsWith('~$')) {
      console.log(`[QCWatcher] Ignoring temp file: ${filename}`)
      return
    }

    console.log(`[QCWatcher] ✓ New DOCX file detected: ${filename}`)
    console.log(`[QCWatcher]   Path: ${filePath}`)
    console.log(`[QCWatcher]   Timestamp: ${new Date().toISOString()}`)

    // Mark this file as recently processed
    this.recentlyProcessedFiles.set(filePath, Date.now())
    
    // Clean up old entries (older than threshold)
    const cutoff = Date.now() - this.DUPLICATE_THRESHOLD_MS
    for (const [file, timestamp] of this.recentlyProcessedFiles.entries()) {
      if (timestamp < cutoff) {
        this.recentlyProcessedFiles.delete(file)
      }
    }

    const event: WatchEvent = {
      type: 'add',
      filePath,
      filename,
      timestamp: new Date().toISOString()
    }

    this.emit('file-detected', event)
  }

  isActive(): boolean {
    return this.isWatching
  }

  getWatchedFolders(): string[] {
    return [...this.watchedFolders]
  }

  restart(folders: string[]): void {
    this.stop()
    setTimeout(() => {
      this.start(folders)
    }, 1000)
  }
}

// Singleton instance
let watcherInstance: QCWatcher | null = null

export function getQCWatcher(): QCWatcher {
  if (!watcherInstance) {
    watcherInstance = new QCWatcher()
  }
  return watcherInstance
}

export function startQCWatcher(folders: string[]): void {
  const watcher = getQCWatcher()
  watcher.start(folders)
}

export function stopQCWatcher(): void {
  if (watcherInstance) {
    watcherInstance.stop()
  }
}

export function isQCWatcherActive(): boolean {
  return watcherInstance?.isActive() || false
}
