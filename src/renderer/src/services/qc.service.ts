import type { QCRecord, QCStats, QCConfig, QCFilters, QCBatch } from '../types/qc.types'

interface APIResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export const qcService = {
  async getRecords(filters?: QCFilters, limit?: number, offset?: number): Promise<QCRecord[]> {
    const response = (await window.api.qc.getRecords(
      filters,
      limit,
      offset
    )) as APIResponse<QCRecord[]>
    if (!response.success) {
      throw new Error(response.error || 'Failed to get QC records')
    }
    return response.data || []
  },

  async getRecord(qcId: string): Promise<QCRecord> {
    const response = (await window.api.qc.getRecord(qcId)) as APIResponse<QCRecord>
    if (!response.success) {
      throw new Error(response.error || 'Failed to get QC record')
    }
    if (!response.data) {
      throw new Error('QC record not found')
    }
    return response.data
  },

  async getStats(): Promise<QCStats> {
    const response = (await window.api.qc.getStats()) as APIResponse<QCStats>
    if (!response.success) {
      throw new Error(response.error || 'Failed to get QC statistics')
    }
    return (
      response.data || {
        total: 0,
        queued: 0,
        converting: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        todayCompleted: 0,
        avgScore: 0,
        avgProcessingTime: 0
      }
    )
  },

  async getConfig(): Promise<QCConfig> {
    const response = (await window.api.qc.getConfig()) as APIResponse<QCConfig>
    if (!response.success) {
      throw new Error(response.error || 'Failed to get QC configuration')
    }
    return response.data!
  },

  async updateConfig(config: Partial<QCConfig>): Promise<void> {
    const response = (await window.api.qc.updateConfig(config)) as APIResponse<void>
    if (!response.success) {
      throw new Error(response.error || 'Failed to update QC configuration')
    }
  },

  async addWatchFolder(folderPath: string): Promise<void> {
    const response = (await window.api.qc.addWatchFolder(folderPath)) as APIResponse<void>
    if (!response.success) {
      throw new Error(response.error || 'Failed to add watch folder')
    }
  },

  async removeWatchFolder(folderPath: string): Promise<void> {
    const response = (await window.api.qc.removeWatchFolder(folderPath)) as APIResponse<void>
    if (!response.success) {
      throw new Error(response.error || 'Failed to remove watch folder')
    }
  },

  async testConnection(): Promise<{ success: boolean; data: any }> {
    return (await window.api.qc.testConnection()) as any
  },

  async getWatcherStatus(): Promise<{ isActive: boolean; watchedFolders: string[] }> {
    const response = (await window.api.qc.getWatcherStatus()) as APIResponse<{
      isActive: boolean
      watchedFolders: string[]
    }>
    if (!response.success) {
      throw new Error(response.error || 'Failed to get watcher status')
    }
    return response.data!
  },

  async startWatcher(): Promise<void> {
    const response = (await window.api.qc.startWatcher()) as APIResponse<void>
    if (!response.success) {
      throw new Error(response.error || 'Failed to start watcher')
    }
  },

  async stopWatcher(): Promise<void> {
    const response = (await window.api.qc.stopWatcher()) as APIResponse<void>
    if (!response.success) {
      throw new Error(response.error || 'Failed to stop watcher')
    }
  },

  async deleteRecord(qcId: string): Promise<void> {
    const response = (await window.api.qc.deleteRecord(qcId)) as APIResponse<void>
    if (!response.success) {
      throw new Error(response.error || 'Failed to delete record')
    }
  },

  async deleteAllRecords(): Promise<number> {
    const response = (await window.api.qc.deleteAllRecords()) as APIResponse<number>
    if (!response.success) {
      throw new Error(response.error || 'Failed to delete all records')
    }
    return response.data || 0
  },

  async retryRecord(qcId: string): Promise<void> {
    const response = (await window.api.qc.retryRecord(qcId)) as APIResponse<void>
    if (!response.success) {
      throw new Error(response.error || 'Failed to retry record')
    }
  },

  async getBatches(statusFilter?: string[]): Promise<QCBatch[]> {
    const response = (await window.api.qc.getBatches(statusFilter)) as APIResponse<QCBatch[]>
    if (!response.success) {
      throw new Error(response.error || 'Failed to get batches')
    }
    return response.data || []
  },

  async retryBatch(batchId: string): Promise<void> {
    const response = (await window.api.qc.retryBatch(batchId)) as APIResponse<void>
    if (!response.success) {
      throw new Error(response.error || 'Failed to retry batch')
    }
  },

  async getBatchFiles(batchId: string): Promise<QCRecord[]> {
    const response = (await window.api.qc.getBatchFiles(batchId)) as APIResponse<QCRecord[]>
    if (!response.success) {
      throw new Error(response.error || 'Failed to get batch files')
    }
    return response.data || []
  },

  onFileDetected(callback: (data: any) => void): () => void {
    return window.api.qc.onFileDetected((_event, data) => callback(data))
  },

  onStatusUpdate(callback: (data: any) => void): () => void {
    return window.api.qc.onStatusUpdate((_event, data) => callback(data))
  },

  onQueueUpdate(callback: (data: { queueLength: number }) => void): () => void {
    return window.api.qc.onQueueUpdate((_event, data) => callback(data))
  },

  onError(callback: (data: { message: string }) => void): () => void {
    return window.api.qc.onError((_event, data) => callback(data))
  }
}
