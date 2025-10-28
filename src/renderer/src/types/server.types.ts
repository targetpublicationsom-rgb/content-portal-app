export interface ServerInfo {
  port?: number
  status?: string
}

export interface HealthStatus {
  status: string
  port?: number
  timestamp?: string
}

export interface HealthResponse {
  status: string
  timestamp?: string
}
