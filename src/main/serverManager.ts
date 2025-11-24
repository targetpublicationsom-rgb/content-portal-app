import { app, BrowserWindow } from 'electron'
import { spawn, execSync } from 'child_process'
import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import {
  createServerContext,
  transitionServerState,
  canStart,
  canStop,
  isServerRunning as checkRunning,
  isServerStarting as checkStarting,
  shouldRetry,
  incrementRetry,
  resetRetry,
  setQuitting as setContextQuitting,
  type ServerContext
} from './serverStateMachine'

const DEFAULT_PORT = 6284
let serverContext: ServerContext | null = null

// Extract exe from ASAR to userData for OTA updates
async function extractServerExecutable(): Promise<string> {
  const userDataPath = app.getPath('userData')
  const toolsDir = path.join(userDataPath, 'tools')
  const targetExePath = path.join(toolsDir, 'content-orchestrator.exe')
  const versionFile = path.join(toolsDir, 'version.txt')
  const currentVersion = app.getVersion()

  // Check if already extracted and version matches
  if (fs.existsSync(targetExePath) && fs.existsSync(versionFile)) {
    try {
      const extractedVersion = fs.readFileSync(versionFile, 'utf-8').trim()
      if (extractedVersion === currentVersion) {
        console.log('[ServerManager] Executable already extracted for version', currentVersion)
        return targetExePath
      }
      console.log(
        `[ServerManager] Version mismatch - re-extracting (old: ${extractedVersion}, new: ${currentVersion})`
      )
    } catch (err) {
      console.log('[ServerManager] Failed to read version file, re-extracting:', err)
    }
  }

  // Create tools directory
  if (!fs.existsSync(toolsDir)) {
    fs.mkdirSync(toolsDir, { recursive: true })
  }

  // Determine source path (ASAR bundled)
  const sourceExePath = is.dev
    ? path.join(process.cwd(), 'tools', 'content-orchestrator.exe')
    : path.join(process.resourcesPath, 'app.asar', 'tools', 'content-orchestrator.exe')

  console.log('[ServerManager] Extracting from:', sourceExePath)
  console.log('[ServerManager] Extracting to:', targetExePath)

  try {
    await fsPromises.copyFile(sourceExePath, targetExePath)
    fs.writeFileSync(versionFile, currentVersion, 'utf-8')
    console.log('[ServerManager] Executable extracted successfully')
    return targetExePath
  } catch (err) {
    console.error('[ServerManager] Failed to extract executable:', err)
    throw err
  }
}

// Kill any existing server processes
function killExistingProcesses(): void {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /IM content-orchestrator.exe /F', { stdio: 'ignore' })
      console.log('[ServerManager] Killed existing processes')
    } else {
      execSync('pkill -f "content-orchestrator"', { stdio: 'ignore' })
    }
  } catch {
    // Ignore errors if nothing to kill
  }
}

// Initialize server context
export function initializeServerManager(mainWindow: BrowserWindow): void {
  serverContext = createServerContext(mainWindow, DEFAULT_PORT)
  console.log('[ServerManager] Initialized')
}

// Start server with state machine
export async function startServer(): Promise<void> {
  if (!serverContext) {
    throw new Error('Server context not initialized')
  }

  if (!canStart(serverContext)) {
    console.warn(`[ServerManager] Cannot start from state: ${serverContext.state}`)
    return
  }

  // Transition to initializing
  transitionServerState(serverContext, 'initializing', 'Initializing Content Orchestrator...')

  try {
    // Kill existing processes
    killExistingProcesses()

    // Extract executable
    transitionServerState(serverContext, 'extracting', 'Extracting server files...')
    const executablePath = serverContext.extractedExePath || (await extractServerExecutable())
    serverContext.extractedExePath = executablePath

    // Check if executable exists
    if (!fs.existsSync(executablePath)) {
      throw new Error(`Executable not found: ${executablePath}`)
    }

    // Transition to starting
    transitionServerState(serverContext, 'starting', 'Starting Content Orchestrator...')

    // Start the process
    await startServerProcess(serverContext, executablePath)

    // Reset retry count on successful start
    resetRetry(serverContext)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[ServerManager] Failed to start server:', errorMessage)

    // Check if we should retry
    if (shouldRetry(serverContext)) {
      incrementRetry(serverContext)
      console.log(
        `[ServerManager] Retrying (${serverContext.retryCount}/${serverContext.maxRetries})...`
      )

      // Wait 2 seconds before retry
      await new Promise((resolve) => setTimeout(resolve, 2000))
      return startServer()
    } else {
      // Max retries reached
      transitionServerState(
        serverContext,
        'error',
        'Failed to start server after retries',
        errorMessage
      )
      throw error
    }
  }
}

// Start the actual server process
function startServerProcess(context: ServerContext, executablePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Spawn the process
    context.process = spawn(executablePath, [], {
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let resolved = false

    // Setup timeout fallback
    context.startupTimeout = setTimeout(() => {
      if (!resolved && context.state === 'starting') {
        console.log('[ServerManager] Startup timeout - assuming server is running')
        resolved = true
        transitionServerState(context, 'running', 'Content Orchestrator is ready!')
        resolve()
      }
    }, 10000) // 10 second timeout

    // Listen to stdout for startup confirmation
    context.process.stdout?.on('data', (data) => {
      const message = data.toString().trim()
      console.log(`[Server]: ${message}`)

      if (
        !resolved &&
        (message.includes('Running on') ||
          message.includes('Server started') ||
          message.includes('started'))
      ) {
        resolved = true
        if (context.startupTimeout) {
          clearTimeout(context.startupTimeout)
          context.startupTimeout = null
        }
        transitionServerState(context, 'running', 'Content Orchestrator is ready!')
        resolve()
      }
    })

    // Listen to stderr
    context.process.stderr?.on('data', (data) => {
      console.error(`[Server Error]: ${data.toString()}`)
    })

    // Handle process errors
    context.process.on('error', (err) => {
      console.error('[ServerManager] Process error:', err)
      if (!resolved) {
        resolved = true
        if (context.startupTimeout) {
          clearTimeout(context.startupTimeout)
          context.startupTimeout = null
        }
        transitionServerState(context, 'error', 'Failed to start server', err.message)
        reject(err)
      }
    })

    // Handle process exit
    context.process.on('close', (code) => {
      console.log(`[ServerManager] Process exited with code ${code}`)
      context.process = null

      if (context.startupTimeout) {
        clearTimeout(context.startupTimeout)
        context.startupTimeout = null
      }

      if (context.state !== 'stopping') {
        transitionServerState(context, 'stopped', 'Server stopped unexpectedly')

        // Auto-restart if not quitting
        if (!context.isQuitting && shouldRetry(context)) {
          console.log('[ServerManager] Auto-restarting server...')
          transitionServerState(context, 'restarting', 'Restarting server...')
          setTimeout(() => {
            startServer().catch((err) => console.error('[ServerManager] Failed to restart:', err))
          }, 2000)
        }
      }
    })
  })
}

// Stop server
export async function stopServer(): Promise<void> {
  if (!serverContext) {
    console.warn('[ServerManager] Server context not initialized')
    return
  }

  if (!canStop(serverContext)) {
    console.warn(`[ServerManager] Cannot stop from state: ${serverContext.state}`)
    return
  }

  transitionServerState(serverContext, 'stopping', 'Stopping server...')

  if (serverContext.process) {
    try {
      serverContext.process.kill('SIGTERM')
      
      // Wait for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Force kill if still running
      if (serverContext.process && !serverContext.process.killed) {
        serverContext.process.kill('SIGKILL')
      }
    } catch (error) {
      console.error('[ServerManager] Error stopping process:', error)
    }
  }

  // Kill any remaining processes
  killExistingProcesses()

  transitionServerState(serverContext, 'stopped', 'Server stopped')
}

// Set quitting flag
export function setQuitting(isQuitting: boolean): void {
  if (serverContext) {
    setContextQuitting(serverContext, isQuitting)
  }
}

// Get server status
export function isServerRunning(): boolean {
  return serverContext ? checkRunning(serverContext) : false
}

export function isServerStarting(): boolean {
  return serverContext ? checkStarting(serverContext) : false
}

export function getServerPort(): number {
  return serverContext?.port || DEFAULT_PORT
}
