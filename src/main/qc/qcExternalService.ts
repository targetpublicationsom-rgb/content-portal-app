import axios, { AxiosInstance, AxiosError } from 'axios'
import * as fs from 'fs'
import FormData from 'form-data'

export interface QCSubmitResponse {
  qc_id: string
  status: 'queued' | 'processing'
  message?: string
}

export interface QCStatusResponse {
  qc_id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress?: number
  message?: string
}

export interface QCReportResponse {
  qc_id: string
  score: number
  issues_found: number
  report_md: string
  completed_at: string
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
        Authorization: `Bearer ${apiKey}`,
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
      formData.append('filename', filename)

      const response = await this.retryRequest(async () => {
        return await this.client!.post<QCSubmitResponse>('/qc/submit', formData, {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.apiKey}`
          }
        })
      })

      console.log(`[QCExternalService] Submitted successfully. QC ID: ${response.data.qc_id}`)
      return response.data
    } catch (error) {
      this.handleError('Failed to submit PDF for QC', error)
      throw error
    }
  }

  async getQCStatus(externalQcId: string): Promise<QCStatusResponse> {
    if (!this.client) {
      throw new Error('Service not configured. Call configure() first.')
    }

    try {
      const response = await this.client.get<QCStatusResponse>(`/qc/status/${externalQcId}`)
      return response.data
    } catch (error) {
      this.handleError('Failed to get QC status', error)
      throw error
    }
  }

  async getQCReport(externalQcId: string): Promise<QCReportResponse> {
    if (!this.client) {
      throw new Error('Service not configured. Call configure() first.')
    }

    console.log(`[QCExternalService] Fetching report for QC ID: ${externalQcId}`)

    try {
      const response = await this.client.get<QCReportResponse>(`/qc/report/${externalQcId}`)
      console.log(`[QCExternalService] Report fetched successfully (Score: ${response.data.score})`)
      return response.data
    } catch (error) {
      this.handleError('Failed to get QC report', error)
      throw error
    }
  }

  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 2000
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn()
      } catch (error) {
        lastError = error as Error
        console.warn(`[QCExternalService] Attempt ${attempt}/${maxRetries} failed:`, error)

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1) // Exponential backoff
          console.log(`[QCExternalService] Retrying in ${delay}ms...`)
          await this.sleep(delay)
        }
      }
    }

    throw lastError || new Error('Request failed after retries')
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
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
