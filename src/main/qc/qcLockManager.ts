import * as fs from 'fs/promises'
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
async function getLockDirectory(basePath: string): Promise<string> {
  const lockDir = path.join(basePath, LOCK_DIR)
  try {
    await fs.access(lockDir)
  } catch {
    await fs.mkdir(lockDir, { recursive: true })
  }
  return lockDir
}

// Generate lock file name from file path
function getLockFileName(filePath: string): string {
  const normalized = filePath.replace(/[\\/:*?"<>|]/g, '_')
  return `${normalized}${LOCK_EXTENSION}`
}

// Get lock file path
async function getLockFilePath(basePath: string, filePath: string): Promise<string> {
  const lockDir = await getLockDirectory(basePath)
  const lockFileName = getLockFileName(filePath)
  return path.join(lockDir, lockFileName)
}

// Check if a file is currently locked
export async function checkLock(basePath: string, filePath: string): Promise<LockInfo | null> {
  const lockFilePath = await getLockFilePath(basePath, filePath)

  try {
    await fs.access(lockFilePath)
  } catch {
    return null
  }

  try {
    const content = await fs.readFile(lockFilePath, 'utf-8')
    const lockInfo: LockInfo = JSON.parse(content)

    // Check if lock is stale
    const age = Date.now() - lockInfo.timestamp
    if (age > LOCK_TIMEOUT) {
      console.log(
        `[QCLockManager] Lock is stale (${Math.round(age / 1000)}s old), removing: ${filePath}`
      )
      await fs.unlink(lockFilePath)
      return null
    }

    return lockInfo
  } catch (error) {
    console.error('[QCLockManager] Error reading lock file:', error)
    // If we can't read it, remove it
    try {
      await fs.unlink(lockFilePath)
    } catch {
      // Ignore errors when removing invalid lock file
    }
    return null
  }
}

// Acquire a lock for a file
export async function acquireLock(
  basePath: string,
  qcId: string,
  filePath: string
): Promise<{ success: boolean; error?: string; lockedBy?: string }> {
  try {
    // Check if already locked
    const existingLock = await checkLock(basePath, filePath)
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

    const lockFilePath = await getLockFilePath(basePath, filePath)
    await fs.writeFile(lockFilePath, JSON.stringify(lockInfo, null, 2), 'utf-8')

    console.log(`[QCLockManager] Lock acquired for: ${filePath}`)
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[QCLockManager] Error acquiring lock:', error)
    return { success: false, error: errorMessage }
  }
}

// Release a lock for a file
export async function releaseLock(basePath: string, filePath: string): Promise<boolean> {
  try {
    const lockFilePath = await getLockFilePath(basePath, filePath)

    try {
      await fs.access(lockFilePath)
    } catch {
      console.warn(`[QCLockManager] Lock file doesn't exist: ${lockFilePath}`)
      return false
    }

    await fs.unlink(lockFilePath)
    console.log(`[QCLockManager] Lock released for: ${filePath}`)
    return true
  } catch (error) {
    console.error('[QCLockManager] Error releasing lock:', error)
    return false
  }
}

// Clean all stale locks in the lock directory
export async function cleanStaleLocks(basePath: string): Promise<number> {
  try {
    const lockDir = path.join(basePath, LOCK_DIR)

    try {
      await fs.access(lockDir)
    } catch {
      return 0
    }

    const files = await fs.readdir(lockDir)
    let cleaned = 0

    for (const file of files) {
      if (!file.endsWith(LOCK_EXTENSION)) {
        continue
      }

      const lockFilePath = path.join(lockDir, file)

      try {
        const content = await fs.readFile(lockFilePath, 'utf-8')
        const lockInfo: LockInfo = JSON.parse(content)

        const age = Date.now() - lockInfo.timestamp
        if (age > LOCK_TIMEOUT) {
          await fs.unlink(lockFilePath)
          cleaned++
          console.log(
            `[QCLockManager] Cleaned stale lock: ${lockInfo.filePath} (${Math.round(age / 1000)}s old)`
          )
        }
      } catch (error) {
        // If we can't read/parse it, remove it
        await fs.unlink(lockFilePath)
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
export async function getActiveLocks(basePath: string): Promise<LockInfo[]> {
  try {
    const lockDir = path.join(basePath, LOCK_DIR)

    try {
      await fs.access(lockDir)
    } catch {
      return []
    }

    const files = await fs.readdir(lockDir)
    const locks: LockInfo[] = []

    for (const file of files) {
      if (!file.endsWith(LOCK_EXTENSION)) {
        continue
      }

      const lockFilePath = path.join(lockDir, file)

      try {
        const content = await fs.readFile(lockFilePath, 'utf-8')
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
