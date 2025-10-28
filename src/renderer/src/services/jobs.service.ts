import api from '../lib/axios'
import type { JobsResponse, JobDetails } from '../types'

/**
 * Fetch jobs with optional filters and pagination
 */
export const fetchJobs = async (params?: {
  state?: string
  mode?: string
  stream_id?: string
  board_id?: string
  medium_id?: string
  standard_id?: string
  subject_id?: string
  search?: string
  limit?: number
  cursor?: string
}): Promise<JobsResponse> => {
  const { data } = await api.get<JobsResponse>('/jobs', { params })
  return data
}

/**
 * Fetch job details by ID
 */
export const fetchJobDetails = async (jobId: string, serverPort: number): Promise<JobDetails> => {
  const response = await fetch(`http://127.0.0.1:${serverPort}/jobs/${jobId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch job details')
  }
  return response.json()
}

/**
 * Create a new job with file upload
 */
export const createJob = async (formData: FormData): Promise<{ job_id: string }> => {
  try {
    const serverInfo = await window.api.getServerInfo()
    if (serverInfo?.port) {
      const response = await fetch(`http://127.0.0.1:${serverInfo.port}/jobs`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Failed to create job')
      }
      return response.json()
    }
    throw new Error('Server not available')
  } catch (error) {
    console.error('Failed to create job:', error)
    throw error
  }
}

/**
 * Rerun an existing job
 */
export const rerunJob = async (jobId: string): Promise<{ job_id: string }> => {
  const { data } = await api.post<{ job_id: string }>(`/jobs/${jobId}/rerun`)
  return data
}

/**
 * Fetch a report for a job
 */
export const fetchReport = async (reportUrl: string, serverPort: number): Promise<string> => {
  const fullUrl = `http://127.0.0.1:${serverPort}${reportUrl}`
  const response = await fetch(fullUrl)
  if (!response.ok) {
    throw new Error('Failed to fetch report')
  }
  return response.text()
}

/**
 * Fetch logs for a stage
 */
export const fetchStageLogs = async (
  logPath: string,
  serverPort: number
): Promise<{ content: string }> => {
  const response = await fetch(`http://127.0.0.1:${serverPort}/logs?path=${logPath}`)
  if (!response.ok) {
    throw new Error('Failed to fetch logs')
  }
  return response.json()
}
