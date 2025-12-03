import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import type { QCConfig } from '../../shared/qc.types'

let currentConfig: QCConfig | null = null

// Config file path in userData directory
const CONFIG_FILE_PATH = path.join(app.getPath('userData'), 'qc-config.json')

// Load config from JSON file
function loadConfigFromFile(): QCConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8')
      const config = JSON.parse(fileContent) as QCConfig
      console.log('[QCConfig] Loaded configuration from file:', CONFIG_FILE_PATH)
      return config
    }
  } catch (error) {
    console.error('[QCConfig] Failed to load config file:', error)
  }
  return null
}

// Save config to JSON file
export function saveConfig(config: QCConfig): void {
  try {
    // Ensure userData directory exists
    const userDataDir = app.getPath('userData')
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true })
    }

    // Write config to file
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf-8')
    console.log('[QCConfig] Configuration saved to file:', CONFIG_FILE_PATH)

    // Update in-memory config
    currentConfig = config
  } catch (error) {
    console.error('[QCConfig] Failed to save config file:', error)
    throw new Error(`Failed to save configuration: ${error}`)
  }
}

// Load environment variables
function loadEnvConfig(): QCConfig {
  const watchFolder = process.env.VITE_QC_WATCH_FOLDER || ''

  return {
    watchFolders: watchFolder ? [watchFolder] : [],
    apiUrl: process.env.VITE_QC_API_URL || '',
    apiKey: process.env.VITE_QC_API_KEY || ''
  }
}

// Initialize config from file or .env
export function initializeQCConfig(): void {
  // Try to load from file first
  const fileConfig = loadConfigFromFile()
  const envConfig = loadEnvConfig()

  if (fileConfig) {
    // Merge file config with env defaults (env takes precedence for API settings)
    currentConfig = {
      watchFolders: fileConfig.watchFolders,
      apiUrl: fileConfig.apiUrl || envConfig.apiUrl,
      apiKey: fileConfig.apiKey || envConfig.apiKey
    }
    console.log('[QCConfig] Using configuration from file (with env fallback for API)')
  } else {
    // Fallback to environment variables
    currentConfig = envConfig
    console.log('[QCConfig] Using configuration from environment variables')
  }

  console.log('[QCConfig] Watch folders:', currentConfig.watchFolders.join(', ') || 'None')
  console.log('[QCConfig] API URL:', currentConfig.apiUrl || 'Not configured')
  console.log('[QCConfig] API Key:', currentConfig.apiKey ? '***' + currentConfig.apiKey.slice(-4) : 'Not configured')
}

// Get current configuration
export function getConfig(): QCConfig {
  if (!currentConfig) {
    initializeQCConfig()
  }
  return currentConfig!
}

// Get database path (always uses first watch folder/.qc/qc.db)
export function getDatabasePath(): string {
  const config = getConfig()
  
  // Use first watch folder if configured
  if (config.watchFolders && config.watchFolders.length > 0) {
    return path.join(config.watchFolders[0], '.qc', 'qc.db')
  }
  
  // Fallback to userData directory
  return path.join(app.getPath('userData'), 'qc', 'qc.db')
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
