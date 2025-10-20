import { useState, useEffect, useCallback } from 'react'
import { Button } from './ui/button'

interface ServerInfo {
  port: number
}

interface HealthResponse {
  status: string
  timestamp?: string
}

interface JobsResponse {
  jobs: Array<{
    id: string
    name: string
    status: string
  }>
}

export function ServerStatus(): React.JSX.Element {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [isServerRunning, setIsServerRunning] = useState(false)
  const [healthStatus, setHealthStatus] = useState<string>('Checking...')
  const [jobs, setJobs] = useState<JobsResponse['jobs']>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const checkHealth = useCallback(async (port: number): Promise<void> => {
    try {
      console.log(`[Renderer] Checking health at http://127.0.0.1:${port}/health`)
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      console.log(`[Renderer] Health check response status: ${response.status}`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: HealthResponse = await response.json()
      console.log('[Renderer] Health check data:', data)
      setHealthStatus(data.status === 'ok' ? '✅ Healthy' : '⚠️ Unhealthy')
    } catch (err) {
      console.error('[Renderer] Health check failed:', err)
      setHealthStatus(`❌ Failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  const checkServerStatus = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)

      console.log('[Renderer] Checking server status...')

      // Check if server is running via IPC
      const running = await window.api.isServerRunning()
      console.log('[Renderer] Server running:', running)
      setIsServerRunning(running)

      if (running) {
        // Get server info from main process
        const info = await window.api.getServerInfo()
        console.log('[Renderer] Server info:', info)

        if (info) {
          setServerInfo(info)
          // Wait a moment for server to be fully ready
          await new Promise((resolve) => setTimeout(resolve, 500))
          // Test health endpoint
          await checkHealth(info.port)
        } else {
          setError('Server is running but no port information available')
        }
      } else {
        setError('Python server is not running')
      }
    } catch (err) {
      console.error('[Renderer] Failed to check server status:', err)
      setError(`Failed to connect to server: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [checkHealth])

  // Get server info and status on mount
  useEffect(() => {
    checkServerStatus()
  }, [checkServerStatus])

  const fetchJobs = async (): Promise<void> => {
    if (!serverInfo) return

    try {
      setError(null)
      const response = await fetch(`http://127.0.0.1:${serverInfo.port}/jobs`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: JobsResponse = await response.json()
      setJobs(data.jobs || [])
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
      setError(`Failed to fetch jobs: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const createTestJob = async (): Promise<void> => {
    if (!serverInfo) return

    try {
      setError(null)
      const response = await fetch(`http://127.0.0.1:${serverInfo.port}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: `Test Job ${Date.now()}`,
          description: 'A test job created from Electron'
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('Job created:', data)

      // Refresh jobs list
      await fetchJobs()
    } catch (err) {
      console.error('Failed to create job:', err)
      setError(`Failed to create job: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800">Loading server status...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Python FastAPI Server Integration</h1>

      {/* Server Status Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Server Status</h2>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">Running:</span>
            <span className={isServerRunning ? 'text-green-600' : 'text-red-600'}>
              {isServerRunning ? '✅ Yes' : '❌ No'}
            </span>
          </div>

          {serverInfo && (
            <>
              <div className="flex items-center justify-between">
                <span className="font-medium">Port:</span>
                <span className="font-mono">{serverInfo.port}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-medium">API URL:</span>
                <span className="font-mono text-sm">http://127.0.0.1:{serverInfo.port}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-medium">Health:</span>
                <span>{healthStatus}</span>
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <Button onClick={checkServerStatus} variant="outline" size="sm">
            Refresh Status
          </Button>

          {serverInfo && (
            <Button onClick={() => checkHealth(serverInfo.port)} variant="outline" size="sm">
              Check Health
            </Button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium">Error:</p>
          <p className="text-red-700 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Jobs Section */}
      {serverInfo && isServerRunning && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Jobs</h2>
            <div className="flex gap-2">
              <Button onClick={fetchJobs} variant="outline" size="sm">
                Fetch Jobs
              </Button>
              <Button onClick={createTestJob} size="sm">
                Create Test Job
              </Button>
            </div>
          </div>

          {jobs.length === 0 ? (
            <p className="text-gray-500 italic">
              No jobs found. Click &quot;Fetch Jobs&quot; to load or &quot;Create Test Job&quot; to
              add one.
            </p>
          ) : (
            <ul className="space-y-2">
              {jobs.map((job) => (
                <li key={job.id} className="border border-gray-200 rounded p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{job.name}</p>
                      <p className="text-sm text-gray-600">ID: {job.id}</p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-sm ${
                        job.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : job.status === 'running'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="font-semibold mb-2">How it works:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
          <li>Electron starts and spawns the Python FastAPI server</li>
          <li>Python prints port info to stdout as JSON</li>
          <li>Electron captures it and saves to server-info.json</li>
          <li>React reads the port and makes API requests</li>
          <li>If Python crashes, Electron attempts auto-restart</li>
        </ol>
      </div>
    </div>
  )
}
