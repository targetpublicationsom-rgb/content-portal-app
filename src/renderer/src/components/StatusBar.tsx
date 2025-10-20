import { useEffect, useState } from 'react'
import { Badge } from './ui/badge'

interface ServerInfo {
  port?: number
  status?: string
}

interface HealthStatus {
  status: string
  port?: number
}

export default function StatusBar(): React.JSX.Element {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [health, setHealth] = useState<HealthStatus | null>(null)

  useEffect(() => {
    const checkStatus = async (): Promise<void> => {
      try {
        const info = await window.api.getServerInfo()
        setServerInfo(info)

        if (info?.port) {
          const response = await fetch(`http://127.0.0.1:${info.port}/health`)
          if (response.ok) {
            const data = await response.json()
            setHealth(data)
          }
        }
      } catch (error) {
        console.error('Failed to check status:', error)
      }
    }

    checkStatus()
    const interval = setInterval(checkStatus, 5000) // Check every 5 seconds

    return () => clearInterval(interval)
  }, [])

  const getServerStatusBadge = (): React.JSX.Element => {
    if (!serverInfo?.port) {
      return <Badge variant="destructive">Offline</Badge>
    }
    if (health?.status === 'ok') {
      return <Badge variant="success">Online</Badge>
    }
    return <Badge variant="warning">Starting...</Badge>
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 flex items-center justify-between border-t bg-background px-4 py-2 text-sm">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Server:</span>
          {getServerStatusBadge()}
        </div>
        {serverInfo?.port && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Port:</span>
            <span className="font-mono">{serverInfo.port}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        {health && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Health:</span>
            <Badge variant={health.status === 'ok' ? 'success' : 'warning'}>{health.status}</Badge>
          </div>
        )}
      </div>
    </div>
  )
}
