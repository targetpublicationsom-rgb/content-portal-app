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
        /(^|[/\\])\../, // Ignore dotfiles
        /~\$.+\.docx$/ // Ignore Word temp files (~$filename.docx)
      ],
      persistent: true,
      ignoreInitial: false, // Detect existing files too
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
