import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface LockInfo {
  qcId: string
  filePath: string
  processedBy: string
  timestamp: number
  hostname: string
}

const LOCK_TIMEOUT = 10 * 60 * 1000 // 10 minutes
const LOCK_DIR = '.qc'
const LOCK_EXTENSION = '.lock'

// Get user identification string
export function getUserIdentifier(): string {
  const username = os.userInfo().username
  const hostname = os.hostname()
  return `${username}@${hostname}`
}

// Get lock directory path (in watch folder or custom location)
function getLockDirectory(basePath: string): string {
  const lockDir = path.join(basePath, LOCK_DIR)
  if (!fs.existsSync(lockDir)) {
    fs.mkdirSync(lockDir, { recursive: true })
  }
  return lockDir
}

// Generate lock file name from file path
function getLockFileName(filePath: string): string {
  const normalized = filePath.replace(/[\\/:*?"<>|]/g, '_')
  return `${normalized}${LOCK_EXTENSION}`
}

// Get lock file path
function getLockFilePath(basePath: string, filePath: string): string {
  const lockDir = getLockDirectory(basePath)
  const lockFileName = getLockFileName(filePath)
  return path.join(lockDir, lockFileName)
}

// Check if a file is currently locked
export function checkLock(basePath: string, filePath: string): LockInfo | null {
  const lockFilePath = getLockFilePath(basePath, filePath)

  if (!fs.existsSync(lockFilePath)) {
    return null
  }

  try {
    const content = fs.readFileSync(lockFilePath, 'utf-8')
    const lockInfo: LockInfo = JSON.parse(content)

    // Check if lock is stale
    const age = Date.now() - lockInfo.timestamp
    if (age > LOCK_TIMEOUT) {
      console.log(
        `[QCLockManager] Lock is stale (${Math.round(age / 1000)}s old), removing: ${filePath}`
      )
      fs.unlinkSync(lockFilePath)
      return null
    }

    return lockInfo
  } catch (error) {
    console.error('[QCLockManager] Error reading lock file:', error)
    // If we can't read it, remove it
    try {
      fs.unlinkSync(lockFilePath)
    } catch {
      // Ignore errors when removing invalid lock file
    }
    return null
  }
}

// Acquire a lock for a file
export function acquireLock(
  basePath: string,
  qcId: string,
  filePath: string
): { success: boolean; error?: string; lockedBy?: string } {
  try {
    // Check if already locked
    const existingLock = checkLock(basePath, filePath)
    if (existingLock) {
      return {
        success: false,
        error: 'File is already being processed',
        lockedBy: existingLock.processedBy
      }
    }

    const lockInfo: LockInfo = {
      qcId,
      filePath,
      processedBy: getUserIdentifier(),
      timestamp: Date.now(),
      hostname: os.hostname()
    }

    const lockFilePath = getLockFilePath(basePath, filePath)
    fs.writeFileSync(lockFilePath, JSON.stringify(lockInfo, null, 2), 'utf-8')

    console.log(`[QCLockManager] Lock acquired for: ${filePath}`)
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[QCLockManager] Error acquiring lock:', error)
    return { success: false, error: errorMessage }
  }
}

// Release a lock for a file
export function releaseLock(basePath: string, filePath: string): boolean {
  try {
    const lockFilePath = getLockFilePath(basePath, filePath)

    if (!fs.existsSync(lockFilePath)) {
      console.warn(`[QCLockManager] Lock file doesn't exist: ${lockFilePath}`)
      return false
    }

    fs.unlinkSync(lockFilePath)
    console.log(`[QCLockManager] Lock released for: ${filePath}`)
    return true
  } catch (error) {
    console.error('[QCLockManager] Error releasing lock:', error)
    return false
  }
}

// Clean all stale locks in the lock directory
export function cleanStaleLocks(basePath: string): number {
  try {
    const lockDir = path.join(basePath, LOCK_DIR)

    if (!fs.existsSync(lockDir)) {
      return 0
    }

    const files = fs.readdirSync(lockDir)
    let cleaned = 0

    for (const file of files) {
      if (!file.endsWith(LOCK_EXTENSION)) {
        continue
      }

      const lockFilePath = path.join(lockDir, file)

      try {
        const content = fs.readFileSync(lockFilePath, 'utf-8')
        const lockInfo: LockInfo = JSON.parse(content)

        const age = Date.now() - lockInfo.timestamp
        if (age > LOCK_TIMEOUT) {
          fs.unlinkSync(lockFilePath)
          cleaned++
          console.log(
            `[QCLockManager] Cleaned stale lock: ${lockInfo.filePath} (${Math.round(age / 1000)}s old)`
          )
        }
      } catch (error) {
        // If we can't read/parse it, remove it
        fs.unlinkSync(lockFilePath)
        cleaned++
        console.log(`[QCLockManager] Cleaned invalid lock file: ${file}`, error)
      }
    }

    if (cleaned > 0) {
      console.log(`[QCLockManager] Cleaned ${cleaned} stale lock(s)`)
    }

    return cleaned
  } catch (error) {
    console.error('[QCLockManager] Error cleaning stale locks:', error)
    return 0
  }
}

// Get all active locks
export function getActiveLocks(basePath: string): LockInfo[] {
  try {
    const lockDir = path.join(basePath, LOCK_DIR)

    if (!fs.existsSync(lockDir)) {
      return []
    }

    const files = fs.readdirSync(lockDir)
    const locks: LockInfo[] = []

    for (const file of files) {
      if (!file.endsWith(LOCK_EXTENSION)) {
        continue
      }

      const lockFilePath = path.join(lockDir, file)

      try {
        const content = fs.readFileSync(lockFilePath, 'utf-8')
        const lockInfo: LockInfo = JSON.parse(content)

        // Skip stale locks
        const age = Date.now() - lockInfo.timestamp
        if (age <= LOCK_TIMEOUT) {
          locks.push(lockInfo)
        }
      } catch (error) {
        // Skip invalid lock files
        console.warn(`[QCLockManager] Invalid lock file: ${file}`, error)
      }
    }

    return locks
  } catch (error) {
    console.error('[QCLockManager] Error getting active locks:', error)
    return []
  }
}
