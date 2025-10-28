import type { HealthResponse, ServerInfo } from '../types'

/**
 * Check server health
 */
export const checkServerHealth = async (port: number): Promise<HealthResponse> => {
  const response = await fetch(`http://127.0.0.1:${port}/health`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get server info from Electron API
 */
export const getServerInfo = async (): Promise<ServerInfo | null> => {
  return window.api.getServerInfo()
}
