import { spawn, ChildProcess } from 'child_process'
import { app, dialog } from 'electron'
import { join } from 'path'
import { writeFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'

interface ServerInfo {
  port: number
}

export class PythonServerManager {
  private pythonProcess: ChildProcess | null = null
  private serverInfo: ServerInfo | null = null
  private serverInfoPath: string
  private isShuttingDown = false
  private startupTimeout = 30000 // 30 seconds timeout
  private restartAttempts = 0
  private maxRestartAttempts = 3
  private restartDelay = 2000 // 2 seconds between restart attempts

  constructor() {
    // Store server info in user data directory
    this.serverInfoPath = join(app.getPath('userData'), 'server-info.json')
  }

  /**
   * Starts the Python FastAPI server process
   * @returns Promise that resolves with server info when ready
   */
  async startServer(): Promise<ServerInfo> {
    return new Promise((resolve, reject) => {
      console.log('[Python Server] Starting server...')

      // Determine Python command and arguments
      const { command, args, cwd } = this.getPythonCommand()
      console.log(`[Python Server] Command: ${command} ${args.join(' ')}`)
      console.log(`[Python Server] Working directory: ${cwd}`)

      let stdoutBuffer = ''
      let stderrBuffer = ''
      let serverReady = false

      // Set up startup timeout
      const timeoutHandle = setTimeout(() => {
        if (!serverReady) {
          console.error('[Python Server] Startup timeout exceeded')
          this.killProcess()
          reject(
            new Error(
              `Server failed to start within ${this.startupTimeout / 1000} seconds. Check Python installation and dependencies.`
            )
          )
        }
      }, this.startupTimeout)

      try {
        // Spawn Python process
        this.pythonProcess = spawn(command, args, {
          cwd: cwd, // Set working directory to python-server folder
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
          windowsHide: true, // Hide console window on Windows
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1' // Ensure stdout is not buffered
          }
        })

        // Handle stdout - look for JSON output
        this.pythonProcess.stdout?.on('data', async (data: Buffer) => {
          const output = data.toString()
          console.log('[Python Server] stdout:', output.trim())
          stdoutBuffer += output

          // Try to parse JSON from stdout
          try {
            const lines = stdoutBuffer.split('\n')
            for (const line of lines) {
              const trimmedLine = line.trim()
              if (trimmedLine.startsWith('{') && trimmedLine.includes('port')) {
                const serverInfo = JSON.parse(trimmedLine) as ServerInfo

                if (serverInfo.port && typeof serverInfo.port === 'number') {
                  clearTimeout(timeoutHandle)
                  serverReady = true
                  this.serverInfo = serverInfo

                  // Save server info to file
                  await this.saveServerInfo(serverInfo)
                  console.log(`[Python Server] Server ready on port ${serverInfo.port}`)

                  this.restartAttempts = 0 // Reset restart counter on success
                  resolve(serverInfo)
                  return
                }
              }
            }
          } catch {
            // JSON parsing failed, continue collecting output
          }
        })

        // Handle stderr - log errors
        this.pythonProcess.stderr?.on('data', (data: Buffer) => {
          const error = data.toString()
          stderrBuffer += error
          console.error('[Python Server] stderr:', error.trim())

          // Check for common errors
          if (error.toLowerCase().includes('address already in use')) {
            clearTimeout(timeoutHandle)
            this.killProcess()
            reject(
              new Error(
                'Port is already in use. Please close the application using the port and try again.'
              )
            )
          }
        })

        // Handle process exit
        this.pythonProcess.on('exit', (code, signal) => {
          clearTimeout(timeoutHandle)
          console.log(`[Python Server] Process exited with code ${code} and signal ${signal}`)

          if (!serverReady && !this.isShuttingDown) {
            // Server failed to start
            const errorMessage = stderrBuffer || 'Unknown error'
            reject(new Error(`Python server failed to start: ${errorMessage}`))
          } else if (!this.isShuttingDown && serverReady) {
            // Server crashed after starting
            console.error('[Python Server] Server process terminated unexpectedly')
            this.handleServerCrash()
          }

          this.pythonProcess = null
        })

        // Handle process errors
        this.pythonProcess.on('error', (error) => {
          clearTimeout(timeoutHandle)
          console.error('[Python Server] Process error:', error)

          let errorMessage = error.message
          if (error.message.includes('ENOENT')) {
            errorMessage =
              'Python executable not found. Please ensure Python is installed and in your PATH.'
          }

          this.killProcess()
          reject(new Error(`Failed to start Python server: ${errorMessage}`))
        })
      } catch (error) {
        clearTimeout(timeoutHandle)
        console.error('[Python Server] Failed to spawn process:', error)
        reject(error)
      }
    })
  }

  /**
   * Determines the Python command to run based on environment
   */
  private getPythonCommand(): { command: string; args: string[]; cwd: string } {
    // In production, look for bundled .exe first
    if (app.isPackaged) {
      const exePath = join(process.resourcesPath, 'server', 'orchestrator-server.exe')
      if (existsSync(exePath)) {
        console.log('[Python Server] Using bundled executable:', exePath)
        return { command: exePath, args: [], cwd: process.resourcesPath }
      }
    }

    // Development mode or fallback: use Python module
    // Determine the python-server directory
    // In development, it's relative to the app root
    let pythonServerPath: string

    if (app.isPackaged) {
      // In production, python-server might be in resources
      pythonServerPath = join(process.resourcesPath, 'python-server')
    } else {
      // In development, go up from the built main process to find python-server
      // app.getAppPath() points to the project root in dev mode
      pythonServerPath = join(app.getAppPath(), 'python-server')
    }

    console.log('[Python Server] Python server path:', pythonServerPath)

    // Try different Python commands (python, python3, py)
    const pythonCommands = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']

    // Use the first available Python command
    const command = pythonCommands[0]
    const args = ['-m', 'orchestrator.server']

    return { command, args, cwd: pythonServerPath }
  }

  /**
   * Saves server info to JSON file for renderer process
   */
  private async saveServerInfo(serverInfo: ServerInfo): Promise<void> {
    try {
      await writeFile(this.serverInfoPath, JSON.stringify(serverInfo, null, 2), 'utf-8')
      console.log('[Python Server] Server info saved to:', this.serverInfoPath)
    } catch (error) {
      console.error('[Python Server] Failed to save server info:', error)
      throw error
    }
  }

  /**
   * Handles server crash and attempts to restart
   */
  private async handleServerCrash(): Promise<void> {
    if (this.isShuttingDown) {
      return
    }

    this.restartAttempts++

    if (this.restartAttempts <= this.maxRestartAttempts) {
      console.log(
        `[Python Server] Attempting to restart (attempt ${this.restartAttempts}/${this.maxRestartAttempts})...`
      )

      // Wait before restarting
      await new Promise((resolve) => setTimeout(resolve, this.restartDelay))

      try {
        await this.startServer()
        console.log('[Python Server] Server restarted successfully')
      } catch (error) {
        console.error('[Python Server] Restart failed:', error)

        if (this.restartAttempts >= this.maxRestartAttempts) {
          this.showCrashDialog()
        }
      }
    } else {
      console.error('[Python Server] Max restart attempts reached')
      this.showCrashDialog()
    }
  }

  /**
   * Shows error dialog to user when server crashes
   */
  private showCrashDialog(): void {
    dialog.showErrorBox(
      'Server Error',
      'The backend server has crashed and could not be restarted. Please restart the application.'
    )
  }

  /**
   * Stops the Python server process
   */
  async stopServer(): Promise<void> {
    this.isShuttingDown = true

    if (this.pythonProcess) {
      console.log('[Python Server] Stopping server...')

      return new Promise((resolve) => {
        const killTimeout = setTimeout(() => {
          console.log('[Python Server] Force killing process')
          this.pythonProcess?.kill('SIGKILL')
          resolve()
        }, 5000) // 5 second grace period

        this.pythonProcess?.on('exit', () => {
          clearTimeout(killTimeout)
          console.log('[Python Server] Process stopped')
          this.pythonProcess = null
          resolve()
        })

        // Try graceful shutdown first
        this.killProcess()
      })
    }

    // Clean up server info file
    try {
      if (existsSync(this.serverInfoPath)) {
        await unlink(this.serverInfoPath)
        console.log('[Python Server] Server info file deleted')
      }
    } catch (error) {
      console.error('[Python Server] Failed to delete server info file:', error)
    }
  }

  /**
   * Kills the Python process
   */
  private killProcess(): void {
    if (this.pythonProcess && !this.pythonProcess.killed) {
      // On Windows, use taskkill for proper process termination
      if (process.platform === 'win32') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { execSync } = require('child_process')
          execSync(`taskkill /pid ${this.pythonProcess.pid} /T /F`, { stdio: 'ignore' })
        } catch {
          // Fallback to regular kill
          this.pythonProcess.kill('SIGTERM')
        }
      } else {
        this.pythonProcess.kill('SIGTERM')
      }
    }
  }

  /**
   * Gets current server info
   */
  getServerInfo(): ServerInfo | null {
    return this.serverInfo
  }

  /**
   * Gets path to server info file
   */
  getServerInfoPath(): string {
    return this.serverInfoPath
  }

  /**
   * Checks if server is running
   */
  isRunning(): boolean {
    return this.pythonProcess !== null && !this.pythonProcess.killed
  }
}
