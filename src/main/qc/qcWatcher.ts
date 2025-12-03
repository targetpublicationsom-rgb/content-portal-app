import chokidar, { FSWatcher } from 'chokidar'
import * as path from 'path'
import { EventEmitter } from 'events'

export interface WatchEvent {
  type: 'add' | 'change'
  filePath: string
  filename: string
  timestamp: string
  // Folder-based metadata
  folderPath?: string
  chapterName?: string
  fileType?: 'theory' | 'mcqs-solution' | 'single-file'
  relatedFiles?: {
    theory?: string
    mcqs?: string
    solution?: string
  }
}

interface FolderFiles {
  theory?: string
  mcqs?: string
  solution?: string
  lastUpdate: number
}

class QCWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null
  private watchedFolders: string[] = []
  private isWatching = false
  private recentlyProcessedFiles: Map<string, number> = new Map() // Track recently processed files to prevent duplicates
  private folderContents: Map<string, FolderFiles> = new Map() // Track files within chapter folders
  private readonly DUPLICATE_THRESHOLD_MS = 5000 // 5 seconds
  private readonly FOLDER_STABILIZATION_MS = 3000 // Wait 3s for all files in folder to be detected

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
    this.isWatching = true
    this.recentlyProcessedFiles.clear() // Clear on restart to detect existing files
    console.log(`[QCWatcher] Starting to watch ${folders.length} folder(s)`)

    this.watcher = chokidar.watch(folders, {
      ignored: [
        /(^|[/\\])\.\../, // Ignore dotfiles
        /~\$.+\.docx$/, // Ignore Word temp files (~$filename.docx)
        /(^|[/\\])\.qc($|[/\\])/ // Ignore .qc folder (contains merged files and processing artifacts)
      ],
      persistent: true,
      ignoreInitial: false, // Detect existing files on startup
      awaitWriteFinish: {
        stabilityThreshold: 2000, // Wait 2s after last change
        pollInterval: 100
      },
      usePolling: false,
      depth: 3 // Watch nested structure: watch folder → format folder → chapter folder → files
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
    this.folderContents.clear()
    this.emit('stopped')
  }

  private handleFileAdded(filePath: string): void {
    console.log(`[QCWatcher] File event received: ${filePath}`)

    // Check if this file was recently processed (within threshold)
    const now = Date.now()
    const lastProcessed = this.recentlyProcessedFiles.get(filePath)
    if (lastProcessed && now - lastProcessed < this.DUPLICATE_THRESHOLD_MS) {
      console.log(`[QCWatcher] Ignoring duplicate event: ${filePath}`)
      return
    }

    const ext = path.extname(filePath).toLowerCase()
    if (ext !== '.docx') {
      console.log(`[QCWatcher] Ignoring non-docx file: ${filePath}`)
      return
    }

    const filename = path.basename(filePath)
    if (filename.startsWith('~$')) {
      console.log(`[QCWatcher] Ignoring temp file: ${filename}`)
      return
    }

    console.log(`[QCWatcher] ✓ DOCX file detected: ${filename}`)

    // Determine file structure: watch folder / [format folder] / [chapter folder] / file
    const parentDir = path.dirname(filePath)
    const watchFolder = this.watchedFolders.find((wf) => filePath.startsWith(wf))

    if (!watchFolder) {
      console.log(`[QCWatcher] File not in watched folder: ${filePath}`)
      return
    }

    const relativePath = path.relative(watchFolder, parentDir)
    const pathParts = relativePath.split(path.sep).filter((p) => p && p !== '.')

    // Analyze path structure
    if (pathParts.length === 0) {
      // File is directly in watch folder root - ignore
      console.log(`[QCWatcher] Ignoring file at root level: ${filename}`)
      return
    } else if (pathParts.length === 1) {
      // File is one level deep - must check if it's in a format folder
      const folderName = pathParts[0].toLowerCase()
      if (
        folderName.includes('two-file') ||
        folderName.includes('three-file') ||
        folderName.includes('2-file') ||
        folderName.includes('3-file')
      ) {
        // This is a format folder but file is directly in it (not in chapter subfolder)
        // Ignore - files must be in chapter subfolders
        console.log(`[QCWatcher] Ignoring file directly in format folder: ${filename}`)
        return
      } else {
        // Not a format folder - ignore
        console.log(`[QCWatcher] Ignoring file not in format folder structure: ${filename}`)
        return
      }
    } else if (pathParts.length >= 2) {
      // File is two or more levels deep - check if in format folder structure
      const formatFolder = pathParts[0].toLowerCase()
      
      // Only process if in two-file-format or three-file-format folder
      if (
        !formatFolder.includes('two-file') &&
        !formatFolder.includes('three-file') &&
        !formatFolder.includes('2-file') &&
        !formatFolder.includes('3-file')
      ) {
        console.log(`[QCWatcher] Ignoring file not in two/three-file format folder: ${filename}`)
        return
      }

      const chapterFolder = pathParts[pathParts.length - 1]
      const chapterFolderPath = parentDir

      console.log(`[QCWatcher] Format: ${pathParts[0]}, Chapter: ${chapterFolder}`)
      this.handleChapterFolderFile(filePath, chapterFolderPath, filename, pathParts[0])
    }
  }

  private handleChapterFolderFile(
    filePath: string,
    folderPath: string,
    filename: string,
    formatFolder: string | null
  ): void {
    const chapterName = path.basename(folderPath)
    const formatInfo = formatFolder ? ` (${formatFolder})` : ''
    console.log(`[QCWatcher] File in chapter folder "${chapterName}"${formatInfo}: ${filename}`)

    // Determine file type by suffix/keywords
    const fileType = this.detectFileType(filename)

    // Get or create folder tracking
    if (!this.folderContents.has(folderPath)) {
      this.folderContents.set(folderPath, { lastUpdate: Date.now() })
    }

    const folderFiles = this.folderContents.get(folderPath)!
    folderFiles.lastUpdate = Date.now()

    // Store file path by type
    if (fileType === 'theory') {
      folderFiles.theory = filePath
    } else if (fileType === 'mcqs') {
      folderFiles.mcqs = filePath
    } else if (fileType === 'solution') {
      folderFiles.solution = filePath
    }

    console.log(`[QCWatcher] Chapter "${chapterName}" files:`, {
      theory: !!folderFiles.theory,
      mcqs: !!folderFiles.mcqs,
      solution: !!folderFiles.solution
    })

    // Wait for folder stabilization, then process
    setTimeout(() => {
      this.processChapterFolder(folderPath, chapterName)
    }, this.FOLDER_STABILIZATION_MS)
  }

  private detectFileType(filename: string): 'theory' | 'mcqs' | 'solution' | 'unknown' {
    const lowerName = filename.toLowerCase()

    // Check for theory keywords
    if (lowerName.includes('_theory') || lowerName.includes(' theory')) {
      return 'theory'
    }

    // Check for MCQs keywords
    if (
      lowerName.includes('_mcq') ||
      lowerName.includes(' mcq') ||
      lowerName.includes('_question') ||
      lowerName.includes(' question')
    ) {
      return 'mcqs'
    }

    // Check for solution keywords
    if (
      lowerName.includes('_solution') ||
      lowerName.includes(' solution') ||
      lowerName.includes('_answer') ||
      lowerName.includes(' answer')
    ) {
      return 'solution'
    }

    return 'unknown'
  }

  private processChapterFolder(folderPath: string, chapterName: string): void {
    const folderFiles = this.folderContents.get(folderPath)
    if (!folderFiles) return

    // Check if still within stabilization period (another file was just added)
    const timeSinceUpdate = Date.now() - folderFiles.lastUpdate
    if (timeSinceUpdate < this.FOLDER_STABILIZATION_MS - 100) {
      console.log(`[QCWatcher] Chapter "${chapterName}" still updating, waiting...`)
      return
    }

    console.log(`[QCWatcher] Processing chapter folder: ${chapterName}`)

    const { theory, mcqs, solution } = folderFiles

    // Detect format folder from path
    const watchFolder = this.watchedFolders.find((wf) => folderPath.startsWith(wf))
    let expectedFormat: '2-file' | '3-file' | null = null
    
    if (watchFolder) {
      const relativePath = path.relative(watchFolder, folderPath)
      const pathParts = relativePath.split(path.sep).filter((p) => p && p !== '.')
      if (pathParts.length > 0) {
        const formatFolder = pathParts[0].toLowerCase()
        if (formatFolder.includes('two-file') || formatFolder.includes('2-file')) {
          expectedFormat = '2-file'
        } else if (formatFolder.includes('three-file') || formatFolder.includes('3-file')) {
          expectedFormat = '3-file'
        }
      }
    }

    // Validate format matches expected structure
    const hasThreeFiles = theory && mcqs && solution
    const hasTwoFiles = theory && mcqs && !solution

    if (expectedFormat === '2-file' && hasThreeFiles) {
      console.warn(`[QCWatcher] ⚠️ Format mismatch: ${chapterName} has 3 files but is in "two-file format" folder. Skipping MCQs/Solution processing.`)
      // Only process Theory file
      if (theory && !this.recentlyProcessedFiles.has(theory)) {
        console.log(`[QCWatcher] Emitting Theory file for: ${chapterName}`)
        this.recentlyProcessedFiles.set(theory, Date.now())

        const theoryEvent: WatchEvent = {
          type: 'add',
          filePath: theory,
          filename: path.basename(theory),
          timestamp: new Date().toISOString(),
          folderPath,
          chapterName,
          fileType: 'theory',
          relatedFiles: { theory, mcqs, solution }
        }
        this.emit('file-detected', theoryEvent)
      }
      return
    }

    if (expectedFormat === '3-file' && hasTwoFiles) {
      console.warn(`[QCWatcher] ⚠️ Format mismatch: ${chapterName} has 2 files but is in "three-file format" folder. Skipping MCQs/Solution processing.`)
      // Only process Theory file
      if (theory && !this.recentlyProcessedFiles.has(theory)) {
        console.log(`[QCWatcher] Emitting Theory file for: ${chapterName}`)
        this.recentlyProcessedFiles.set(theory, Date.now())

        const theoryEvent: WatchEvent = {
          type: 'add',
          filePath: theory,
          filename: path.basename(theory),
          timestamp: new Date().toISOString(),
          folderPath,
          chapterName,
          fileType: 'theory',
          relatedFiles: { theory, mcqs, solution }
        }
        this.emit('file-detected', theoryEvent)
      }
      return
    }

    // Process Theory file separately
    if (theory && !this.recentlyProcessedFiles.has(theory)) {
      console.log(`[QCWatcher] Emitting Theory file for: ${chapterName}`)
      this.recentlyProcessedFiles.set(theory, Date.now())

      const theoryEvent: WatchEvent = {
        type: 'add',
        filePath: theory,
        filename: path.basename(theory),
        timestamp: new Date().toISOString(),
        folderPath,
        chapterName,
        fileType: 'theory',
        relatedFiles: { theory, mcqs, solution }
      }
      this.emit('file-detected', theoryEvent)
    }

    // Determine format and process MCQs/Solution
    if (mcqs) {
      const mcqsFilename = path.basename(mcqs).toLowerCase()
      const hasSolutionInName = mcqsFilename.includes('solution') || mcqsFilename.includes('answer')

      if (hasSolutionInName || !solution) {
        // 2-file format: MCQs already contains solution OR no separate solution file
        if (!this.recentlyProcessedFiles.has(mcqs)) {
          console.log(`[QCWatcher] Emitting 2-file format MCQs+Solution for: ${chapterName}`)
          this.recentlyProcessedFiles.set(mcqs, Date.now())

          const mcqsEvent: WatchEvent = {
            type: 'add',
            filePath: mcqs,
            filename: path.basename(mcqs),
            timestamp: new Date().toISOString(),
            folderPath,
            chapterName,
            fileType: 'mcqs-solution',
            relatedFiles: { theory, mcqs, solution }
          }
          this.emit('file-detected', mcqsEvent)
        }
      } else if (solution) {
        // 3-file format: Separate MCQs and Solution files need merging
        const mergeKey = `${mcqs}|${solution}`
        if (!this.recentlyProcessedFiles.has(mergeKey)) {
          console.log(`[QCWatcher] Emitting 3-file format (needs merge) for: ${chapterName}`)
          this.recentlyProcessedFiles.set(mergeKey, Date.now())

          const mergeEvent: WatchEvent = {
            type: 'add',
            filePath: mcqs, // Primary file path (will be merged with solution)
            filename: `${chapterName}_MCQs & Solution.docx`, // Virtual merged filename
            timestamp: new Date().toISOString(),
            folderPath,
            chapterName,
            fileType: 'mcqs-solution',
            relatedFiles: { theory, mcqs, solution }
          }
          this.emit('file-detected', mergeEvent)
        }
      }
    }

    // Clean up old entries
    const cutoff = Date.now() - this.DUPLICATE_THRESHOLD_MS
    for (const [file, timestamp] of this.recentlyProcessedFiles.entries()) {
      if (timestamp < cutoff) {
        this.recentlyProcessedFiles.delete(file)
      }
    }
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
