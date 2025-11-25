import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import type { QCConfig } from '../../shared/qc.types'

let configPath: string
let currentConfig: QCConfig | null = null

// Default configuration
const DEFAULT_CONFIG: QCConfig = {
  watchFolders: [],
  outputFolder: '',
  apiUrl: '',
  apiKey: '',
  pollingInterval: 5000, // 5 seconds
  autoSubmit: true,
  maxRetries: 3
}

// Initialize config path
export function initializeQCConfig(): void {
  const userDataPath = app.getPath('userData')
  const qcDir = path.join(userDataPath, 'qc')

  // Create QC directory if it doesn't exist
  if (!fs.existsSync(qcDir)) {
    fs.mkdirSync(qcDir, { recursive: true })
  }

  configPath = path.join(qcDir, 'config.json')
  console.log(`[QCConfig] Config path: ${configPath}`)

  // Load existing config or create default
  loadConfig()
}

// Load configuration from file
export function loadConfig(): QCConfig {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8')
      currentConfig = JSON.parse(data) as QCConfig
      console.log('[QCConfig] Loaded configuration from file')

      // Set default output folder if not set
      if (!currentConfig.outputFolder) {
        currentConfig.outputFolder = path.join(app.getPath('documents'), 'QC_Reports')
      }
    } else {
      // Create default config
      currentConfig = {
        ...DEFAULT_CONFIG,
        outputFolder: path.join(app.getPath('documents'), 'QC_Reports')
      }
      saveConfig(currentConfig)
      console.log('[QCConfig] Created default configuration')
    }
  } catch (error) {
    console.error('[QCConfig] Error loading config:', error)
    currentConfig = {
      ...DEFAULT_CONFIG,
      outputFolder: path.join(app.getPath('documents'), 'QC_Reports')
    }
  }

  return currentConfig
}

// Save configuration to file
export function saveConfig(config: QCConfig): void {
  try {
    const data = JSON.stringify(config, null, 2)
    fs.writeFileSync(configPath, data, 'utf-8')
    currentConfig = config
    console.log('[QCConfig] Configuration saved')
  } catch (error) {
    console.error('[QCConfig] Error saving config:', error)
    throw error
  }
}

// Get current configuration
export function getConfig(): QCConfig {
  if (!currentConfig) {
    return loadConfig()
  }
  return currentConfig
}

// Update configuration (partial update)
export function updateConfig(updates: Partial<QCConfig>): QCConfig {
  const config = getConfig()
  const updatedConfig = { ...config, ...updates }
  saveConfig(updatedConfig)
  return updatedConfig
}

// Add watch folder
export function addWatchFolder(folderPath: string): QCConfig {
  const config = getConfig()

  if (!config.watchFolders.includes(folderPath)) {
    config.watchFolders.push(folderPath)
    saveConfig(config)
    console.log(`[QCConfig] Added watch folder: ${folderPath}`)
  }

  return config
}

// Remove watch folder
export function removeWatchFolder(folderPath: string): QCConfig {
  const config = getConfig()
  config.watchFolders = config.watchFolders.filter((f) => f !== folderPath)
  saveConfig(config)
  console.log(`[QCConfig] Removed watch folder: ${folderPath}`)
  return config
}

// Validate configuration
export function validateConfig(config: QCConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!config.apiUrl) {
    errors.push('API URL is required')
  }

  if (!config.apiKey) {
    errors.push('API Key is required')
  }

  if (!config.outputFolder) {
    errors.push('Output folder is required')
  }

  if (config.pollingInterval < 1000) {
    errors.push('Polling interval must be at least 1000ms')
  }

  if (config.maxRetries < 1 || config.maxRetries > 10) {
    errors.push('Max retries must be between 1 and 10')
  }

  return {
    valid: errors.length === 0,
    errors
  }
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
  const config = getConfig()
  const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  const baseName = path.basename(originalName, path.extname(originalName))
  const dateFolder = path.join(config.outputFolder, date)
  const qcFolder = path.join(dateFolder, `${baseName}_${qcId.substring(0, 8)}`)

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
