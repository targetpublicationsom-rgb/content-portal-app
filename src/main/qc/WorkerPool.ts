/**
 * Worker Pool Manager
 * Manages worker thread lifecycle, job dispatch, and result collection
 */

import { Worker } from 'worker_threads'
import { EventEmitter } from 'events'
import * as path from 'path'
import type { WorkerMessage, WorkerResponse } from './workers/types'

export type WorkerType = 'word' | 'pandoc' | 'reportParser'

interface WorkerInfo {
  worker: Worker
  type: WorkerType
  busy: boolean
  jobCount: number
  restartCount: number
  lastRestartTime: number
}

interface PendingJob {
  resolve: (value: WorkerResponse) => void
  reject: (error: Error) => void
  timeout?: NodeJS.Timeout
}

export class WorkerPool extends EventEmitter {
  private workers: Map<string, WorkerInfo> = new Map()
  private pendingJobs: Map<string, PendingJob> = new Map()
  private jobQueue: Array<{ type: WorkerType; message: WorkerMessage }> = []
  private isShuttingDown = false

  /**
   * Initialize worker pool
   */
  async initialize(): Promise<void> {
    console.log('[WorkerPool] Initializing...')

    try {
      // Create Word converter worker
      await this.createWorker('word', path.join(__dirname, 'workers', 'wordConverter.worker.js'))

      // Create Pandoc converter worker
      await this.createWorker('pandoc', path.join(__dirname, 'workers', 'pandoc.worker.js'))

      // Create Report parser worker
      await this.createWorker(
        'reportParser',
        path.join(__dirname, 'workers', 'reportParser.worker.js')
      )

      console.log('[WorkerPool] All workers initialized')
    } catch (error) {
      console.error('[WorkerPool] Initialization failed:', error)
      throw error
    }
  }

  /**
   * Create a worker
   */
  private async createWorker(type: WorkerType, workerPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(workerPath, {
          workerData: { autoInit: true }
        })

        const workerId = `${type}-${Date.now()}`
        const workerInfo: WorkerInfo = {
          worker,
          type,
          busy: false,
          jobCount: 0,
          restartCount: 0,
          lastRestartTime: 0
        }

        // Handle messages from worker
        worker.on('message', (response: WorkerResponse) => {
          this.handleWorkerMessage(workerId, response)
        })

        // Handle worker errors
        worker.on('error', (error) => {
          console.error(`[WorkerPool] Worker ${workerId} error:`, error)
          this.emit('worker-error', { workerId, type, error })

          // Restart worker if not shutting down
          if (!this.isShuttingDown) {
            this.restartWorker(workerId, workerPath).catch((err) => {
              console.error(`[WorkerPool] Failed to restart worker ${workerId}:`, err)
            })
          }
        })

        // Handle worker exit
        worker.on('exit', (code) => {
          console.log(`[WorkerPool] Worker ${workerId} exited with code ${code}`)
          this.workers.delete(workerId)

          // Restart worker if not shutting down and exit was unexpected
          if (!this.isShuttingDown && code !== 0) {
            this.restartWorker(workerId, workerPath).catch((err) => {
              console.error(`[WorkerPool] Failed to restart worker ${workerId}:`, err)
            })
          }
        })

        this.workers.set(workerId, workerInfo)
        console.log(`[WorkerPool] Created worker ${workerId} (${type})`)

        // Wait for worker to be ready (Word needs time to initialize COM)
        const readyTimeout = setTimeout(() => {
          reject(new Error(`Worker ${type} failed to initialize within 30 seconds`))
        }, 30000)

        const checkReady = (response: WorkerResponse): void => {
          if (response.id === 'init') {
            clearTimeout(readyTimeout)
            worker.off('message', checkReady)
            
            if (response.type === 'success') {
              resolve()
            } else if (response.type === 'error') {
              reject(new Error(`Worker ${type} initialization failed: ${response.error?.message}`))
            }
          }
        }

        worker.on('message', checkReady)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Restart a worker
   */
  private async restartWorker(workerId: string, workerPath: string): Promise<void> {
    const workerInfo = this.workers.get(workerId)
    if (!workerInfo) return

    const { type, restartCount, lastRestartTime } = workerInfo
    const now = Date.now()
    
    // Reset restart count if last restart was more than 60 seconds ago
    const newRestartCount = now - lastRestartTime > 60000 ? 1 : restartCount + 1
    
    // Prevent infinite restart loop - max 3 restarts within 60 seconds
    if (newRestartCount > 3) {
      console.error(
        `[WorkerPool] Worker ${workerId} failed too many times (${newRestartCount}), not restarting`
      )
      this.workers.delete(workerId)
      this.emit('worker-failed', { workerId, type, reason: 'max_restarts_exceeded' })
      return
    }
    
    console.log(`[WorkerPool] Restarting worker ${workerId} (attempt ${newRestartCount})`)

    // Remove old worker
    this.workers.delete(workerId)

    try {
      // Create new worker
      await this.createWorker(type, workerPath)
      
      // Update restart tracking
      const newWorkerInfo = Array.from(this.workers.values()).find((w) => w.type === type)
      if (newWorkerInfo) {
        newWorkerInfo.restartCount = newRestartCount
        newWorkerInfo.lastRestartTime = now
      }

      // Process queued jobs for this worker type
      this.processQueue()
    } catch (error) {
      console.error(`[WorkerPool] Failed to restart worker ${workerId}:`, error)
      this.emit('worker-failed', { workerId, type, error })
    }
  }

  /**
   * Handle message from worker
   */
  private handleWorkerMessage(workerId: string, response: WorkerResponse): void {
    const workerInfo = this.workers.get(workerId)
    if (!workerInfo) return

    // Handle progress updates
    if (response.type === 'progress') {
      this.emit('progress', { workerId, response })
      return
    }

    // Handle job completion
    const pendingJob = this.pendingJobs.get(response.id)
    if (!pendingJob) {
      // Ignore ready/init messages
      if (response.id === 'init') return
      console.warn(`[WorkerPool] Received response for unknown job ${response.id}`)
      return
    }

    // Clear timeout
    if (pendingJob.timeout) {
      clearTimeout(pendingJob.timeout)
    }

    // Mark worker as not busy
    workerInfo.busy = false
    workerInfo.jobCount++

    // Remove pending job
    this.pendingJobs.delete(response.id)

    // Resolve or reject based on response type
    if (response.type === 'success') {
      pendingJob.resolve(response)
    } else if (response.type === 'error') {
      const error = new Error(response.error?.message || 'Worker job failed')
      if (response.error?.stack) {
        error.stack = response.error.stack
      }
      pendingJob.reject(error)
    }

    // Process next queued job
    this.processQueue()
  }

  /**
   * Process queued jobs
   */
  private processQueue(): void {
    if (this.jobQueue.length === 0) return

    // Find available worker for next job
    for (const workerInfo of this.workers.values()) {
      if (!workerInfo.busy && this.jobQueue.length > 0) {
        const job = this.jobQueue.shift()
        if (job && job.type === workerInfo.type) {
          this.sendJobToWorker(workerInfo, job.message)
        } else if (job) {
          // Put back in queue if worker type doesn't match
          this.jobQueue.unshift(job)
        }
      }
    }
  }

  /**
   * Send job to worker
   */
  private sendJobToWorker(workerInfo: WorkerInfo, message: WorkerMessage): void {
    workerInfo.busy = true
    workerInfo.worker.postMessage(message)
  }

  /**
   * Dispatch job to worker
   */
  async dispatchJob(
    type: WorkerType,
    message: WorkerMessage,
    timeoutMs = 300000
  ): Promise<WorkerResponse> {
    if (this.isShuttingDown) {
      throw new Error('Worker pool is shutting down')
    }

    return new Promise((resolve, reject) => {
      // Find available worker
      let availableWorker: WorkerInfo | undefined
      for (const workerInfo of this.workers.values()) {
        if (workerInfo.type === type && !workerInfo.busy) {
          availableWorker = workerInfo
          break
        }
      }

      // Create pending job
      const timeout = setTimeout(() => {
        this.pendingJobs.delete(message.id)
        reject(new Error(`Job ${message.id} timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pendingJobs.set(message.id, {
        resolve,
        reject,
        timeout
      })

      // Send job or queue it
      if (availableWorker) {
        this.sendJobToWorker(availableWorker, message)
      } else {
        console.log(`[WorkerPool] Queueing job ${message.id} (type: ${type})`)
        this.jobQueue.push({ type, message })
      }
    })
  }

  /**
   * Shutdown all workers
   */
  async shutdown(): Promise<void> {
    console.log('[WorkerPool] Shutting down...')
    this.isShuttingDown = true

    // Reject all pending jobs
    for (const [jobId, pendingJob] of this.pendingJobs.entries()) {
      if (pendingJob.timeout) {
        clearTimeout(pendingJob.timeout)
      }
      pendingJob.reject(new Error('Worker pool shutting down'))
      this.pendingJobs.delete(jobId)
    }

    // Terminate all workers
    const terminatePromises = Array.from(this.workers.values()).map((workerInfo) =>
      workerInfo.worker.terminate()
    )

    await Promise.all(terminatePromises)
    this.workers.clear()

    console.log('[WorkerPool] Shutdown complete')
  }

  /**
   * Get worker statistics
   */
  getStats(): {
    totalWorkers: number
    busyWorkers: number
    queuedJobs: number
    pendingJobs: number
  } {
    let busyWorkers = 0
    for (const workerInfo of this.workers.values()) {
      if (workerInfo.busy) {
        busyWorkers++
      }
    }

    return {
      totalWorkers: this.workers.size,
      busyWorkers,
      queuedJobs: this.jobQueue.length,
      pendingJobs: this.pendingJobs.size
    }
  }
}
