import { BrowserWindow } from 'electron'
import { ChildProcessWithoutNullStreams } from 'child_process'

// Server state machine
export type ServerState =
  | 'idle'
  | 'initializing'
  | 'extracting'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error'
  | 'restarting'

export interface ServerStatus {
  state: ServerState
  message: string
  error?: string
  port?: number
}

export interface ServerContext {
  state: ServerState
  process: ChildProcessWithoutNullStreams | null
  port: number
  retryCount: number
  maxRetries: number
  isQuitting: boolean
  extractedExePath: string | null
  mainWindow: BrowserWindow | null
  startupTimeout: NodeJS.Timeout | null
}

// Initialize context
export function createServerContext(
  mainWindow: BrowserWindow | null,
  defaultPort: number
): ServerContext {
  return {
    state: 'idle',
    process: null,
    port: defaultPort,
    retryCount: 0,
    maxRetries: 3,
    isQuitting: false,
    extractedExePath: null,
    mainWindow,
    startupTimeout: null
  }
}

// State transition with notification
export function transitionServerState(
  context: ServerContext,
  newState: ServerState,
  message: string,
  error?: string
): void {
  const previousState = context.state
  context.state = newState

  console.log(`[ServerState] Transition: ${previousState} → ${newState}`)

  // Notify renderer
  if (context.mainWindow && !context.mainWindow.isDestroyed()) {
    // const status: ServerStatus = {
    //   state: newState,
    //   message,
    //   error,
    //   port: context.port
    // }

    // Map 'running' to 'ready' for frontend compatibility
    const frontendStatus = newState === 'running' ? 'ready' : newState

    context.mainWindow.webContents.send('server-status-change', {
      status: frontendStatus,
      message,
      error
    })
  }

  // Clear startup timeout when reaching terminal states
  if (
    (newState === 'running' || newState === 'stopped' || newState === 'error') &&
    context.startupTimeout
  ) {
    clearTimeout(context.startupTimeout)
    context.startupTimeout = null
  }
}

// Check if state allows starting
export function canStart(context: ServerContext): boolean {
  return context.state === 'idle' || context.state === 'stopped' || context.state === 'error'
}

// Check if state allows stopping
export function canStop(context: ServerContext): boolean {
  return context.state === 'running' || context.state === 'starting'
}

// Check if server is operational
export function isServerRunning(context: ServerContext): boolean {
  return context.state === 'running'
}

// Check if server is in a starting phase
export function isServerStarting(context: ServerContext): boolean {
  return (
    context.state === 'initializing' ||
    context.state === 'extracting' ||
    context.state === 'starting'
  )
}

// Check if should retry
export function shouldRetry(context: ServerContext): boolean {
  return context.retryCount < context.maxRetries && !context.isQuitting
}

// Increment retry counter
export function incrementRetry(context: ServerContext): void {
  context.retryCount++
  console.log(`[ServerState] Retry count: ${context.retryCount}/${context.maxRetries}`)
}

// Reset retry counter
export function resetRetry(context: ServerContext): void {
  context.retryCount = 0
  console.log(`[ServerState] Retry count reset`)
}

// Set quitting flag
export function setQuitting(context: ServerContext, isQuitting: boolean): void {
  context.isQuitting = isQuitting
  console.log(`[ServerState] Quitting flag set to: ${isQuitting}`)
}

// Get current state
export function getCurrentState(context: ServerContext): ServerState {
  return context.state
}

// Get status object for IPC
export function getStatusForIPC(context: ServerContext): ServerStatus {
  return {
    state: context.state,
    message: getMessageForState(context.state),
    port: context.port
  }
}

// Helper to get message for state
function getMessageForState(state: ServerState): string {
  switch (state) {
    case 'idle':
      return 'Server idle'
    case 'initializing':
      return 'Initializing Content Orchestrator...'
    case 'extracting':
      return 'Extracting server files...'
    case 'starting':
      return 'Starting Content Orchestrator...'
    case 'running':
      return 'Content Orchestrator is ready!'
    case 'stopping':
      return 'Stopping server...'
    case 'stopped':
      return 'Server stopped'
    case 'error':
      return 'Server failed to start'
    case 'restarting':
      return 'Restarting server...'
    default:
      return 'Unknown state'
  }
}
