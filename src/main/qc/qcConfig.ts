import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import type { QCConfig } from '../../shared/qc.types'

let currentConfig: QCConfig | null = null

// Load environment variables
function loadEnvConfig(): QCConfig {
  const watchFolder = process.env.VITE_QC_WATCH_FOLDER || ''
  
  return {
    watchFolders: watchFolder ? [watchFolder] : [],
    databasePath: watchFolder ? path.join(watchFolder, '.qc', 'qc.db') : path.join(app.getPath('userData'), 'qc', 'qc.db'),
    apiUrl: process.env.VITE_QC_API_URL || '',
    apiKey: process.env.VITE_QC_API_KEY || '',
    pollingInterval: parseInt(process.env.VITE_QC_POLLING_INTERVAL || '5000'),
    autoSubmit: process.env.VITE_QC_AUTO_SUBMIT !== 'false',
    maxRetries: parseInt(process.env.VITE_QC_MAX_RETRIES || '3')
  }
}

// Initialize config from .env
export function initializeQCConfig(): void {
  currentConfig = loadEnvConfig()
  
  console.log('[QCConfig] Loaded configuration from .env')
  console.log('[QCConfig] Watch folder:', currentConfig.watchFolders[0] || 'Not set')
  console.log('[QCConfig] Database path:', currentConfig.databasePath)
  console.log('[QCConfig] API URL:', currentConfig.apiUrl || 'Not set')
  console.log('[QCConfig] Auto-submit:', currentConfig.autoSubmit)
}

// Get current configuration
export function getConfig(): QCConfig {
  if (!currentConfig) {
    initializeQCConfig()
  }
  return currentConfig!
}

// Get database path (always uses watch folder/.qc/qc.db if watch folder is set)
export function getDatabasePath(): string {
  const config = getConfig()
  return config.databasePath
}

// Get lock base path (directory where .qc folder with locks will be created)
export function getLockBasePath(): string {
  const config = getConfig()

  // If watch folders are configured, use first watch folder
  if (config.watchFolders && config.watchFolders.length > 0) {
    return config.watchFolders[0]
  }

  // Otherwise, use database directory's parent
  const dbPath = getDatabasePath()
  return path.dirname(path.dirname(dbPath)) // Remove qc.db and .qc
}

// Get output paths for a QC record
export function getQCOutputPaths(
  qcId: string,
  originalName: string
): {
  pdfPath: string
  reportMdPath: string
  reportDocxPath: string
} {
  const baseName = path.basename(originalName, path.extname(originalName))
  
  // Store everything in .qc folder for centralized management
  const lockBasePath = getLockBasePath()
  const qcFolder = path.join(lockBasePath, '.qc', 'pdfs', qcId.substring(0, 8))

  // Create folders if they don't exist
  if (!fs.existsSync(qcFolder)) {
    fs.mkdirSync(qcFolder, { recursive: true })
  }

  return {
    pdfPath: path.join(qcFolder, `${baseName}.pdf`),
    reportMdPath: path.join(qcFolder, `qc_report.md`),
    reportDocxPath: path.join(qcFolder, `qc_report.docx`)
  }
}
