import axios, { AxiosInstance, AxiosError } from 'axios'
import * as fs from 'fs'
import FormData from 'form-data'
import type { BatchSubmitResponse, BatchStatusResponse, BatchManifest } from '../../shared/qc.types'

export interface QCSubmitResponse {
  success: boolean
  job_id: string
  status: 'PENDING' | 'PROCESSING'
  message: string
  timestamp: string
}

export interface QCStatusResponse {
  job_id: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  result?: string // Markdown report when COMPLETED
  issues_count?: number // Total number of issues found
  created_at: string
  updated_at: string
}

class QCExternalService {
  private client: AxiosInstance | null = null
  private apiUrl = ''
  private apiKey = ''

  configure(apiUrl: string, apiKey: string): void {
    this.apiUrl = apiUrl
    this.apiKey = apiKey

    this.client = axios.create({
      baseURL: apiUrl,
      timeout: 120000, // 2 minutes for file uploads
      headers: {
        'x-api-key': `${apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    console.log(`[QCExternalService] Configured with API: ${apiUrl}`)
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) {
      throw new Error('Service not configured. Call configure() first.')
    }

    try {
      // Try to hit a health endpoint or root endpoint
      await this.client.get('/health')
      console.log('[QCExternalService] Connection test successful')
      return true
    } catch (error) {
      console.error('[QCExternalService] Connection test failed:', error)
      return false
    }
  }

  async submitPdfForQC(pdfPath: string, filename: string): Promise<QCSubmitResponse> {
    if (!this.client) {
      throw new Error('Service not configured. Call configure() first.')
    }

    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`)
    }

    console.log(`[QCExternalService] Submitting ${filename} for QC...`)

    try {
      const formData = new FormData()
      formData.append('file', fs.createReadStream(pdfPath))

      const response = await this.client.post<QCSubmitResponse>('/qc/process-pdf', formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${this.apiKey}`
        }
      })

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to submit PDF')
      }

      console.log(`[QCExternalService] Submitted successfully. Job ID: ${response.data.job_id}`)
      return response.data
    } catch (error) {
      this.handleError('Failed to submit PDF for QC', error)
      throw error
    }
  }

  async getQCStatus(jobId: string): Promise<QCStatusResponse> {
    if (!this.client) {
      throw new Error('Service not configured. Call configure() first.')
    }

    try {
      const response = await this.client.get<QCStatusResponse>(`/qc/jobs/${jobId}`)
      return response.data
    } catch (error) {
      this.handleError('Failed to get QC status', error)
      throw error
    }
  }

  async submitBatchForQC(
    zipPath: string,
    batchId: string,
    manifest: BatchManifest
  ): Promise<BatchSubmitResponse> {
    if (!this.client) {
      throw new Error('Service not configured. Call configure() first.')
    }

    if (!fs.existsSync(zipPath)) {
      throw new Error(`ZIP file not found: ${zipPath}`)
    }

    console.log(`[QCExternalService] Submitting batch ${batchId} with ${manifest.file_count} files...`)

    try {
      const formData = new FormData()
      formData.append('file', fs.createReadStream(zipPath))
      formData.append('batch_id', batchId)

      const response = await this.client.post<BatchSubmitResponse>(
        '/qc/batch-process',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.apiKey}`
          },
          timeout: 300000 // 5 minutes for batch uploads
        }
      )

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to submit batch')
      }

      console.log(
        `[QCExternalService] Batch submitted successfully. Batch ID: ${response.data.batch_id}, Jobs: ${response.data.jobs.length}`
      )
      return response.data
    } catch (error) {
      this.handleError('Failed to submit batch for QC', error)
      throw error
    }
  }

  async getQCBatchStatus(batchId: string): Promise<BatchStatusResponse> {
    if (!this.client) {
      throw new Error('Service not configured. Call configure() first.')
    }

    try {
      const response = await this.client.get<BatchStatusResponse>(`/qc/batches/${batchId}`)
      return response.data
    } catch (error) {
      this.handleError('Failed to get batch status', error)
      throw error
    }
  }

  private handleError(message: string, error: unknown): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError
      if (axiosError.response) {
        console.error(
          `${message}: ${axiosError.response.status} - ${JSON.stringify(axiosError.response.data)}`
        )
      } else if (axiosError.request) {
        console.error(`${message}: No response received from server`)
      } else {
        console.error(`${message}: ${axiosError.message}`)
      }
    } else {
      console.error(`${message}:`, error)
    }
  }

  isConfigured(): boolean {
    return this.client !== null && this.apiUrl !== '' && this.apiKey !== ''
  }
}

// Singleton instance
let serviceInstance: QCExternalService | null = null

export function getQCExternalService(): QCExternalService {
  if (!serviceInstance) {
    serviceInstance = new QCExternalService()
  }
  return serviceInstance
}

export function configureQCExternalService(apiUrl: string, apiKey: string): void {
  const service = getQCExternalService()
  service.configure(apiUrl, apiKey)
}

export async function testConnection(): Promise<boolean> {
  const service = getQCExternalService()
  return await service.testConnection()
}
