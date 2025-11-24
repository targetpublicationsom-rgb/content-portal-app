import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Loader2, CheckCircle, XCircle, Clock, RotateCcw } from 'lucide-react'

interface ServerStatus {
  status: 'starting' | 'ready' | 'error' | 'stopped'
  message: string
}

interface ServerStartupProps {
  onServerReady: () => void
}

export default function ServerStartup({ onServerReady }: ServerStartupProps): React.JSX.Element {
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    status: 'starting',
    message: 'Initializing Content Orchestrator...'
  })
  const [showUpdateOverlay, setShowUpdateOverlay] = useState(false)
  const [dots, setDots] = useState('')

  useEffect(() => {
    // Check initial server status
    const checkInitialStatus = async (): Promise<void> => {
      try {
        const isRunning = await window.api?.isServerRunning()
        const isStarting = await window.api?.isServerStarting()

        if (isRunning) {
          setServerStatus({ status: 'ready', message: 'Content Orchestrator is ready!' })
          onServerReady()
        } else if (isStarting) {
          setServerStatus({ status: 'starting', message: 'Starting Content Orchestrator...' })
        } else {
          setServerStatus({ status: 'error', message: 'Server not starting' })
        }
      } catch {
        setServerStatus({ status: 'error', message: 'Unable to check server status' })
      }
    }

    checkInitialStatus()

    // Listen to update status changes
    const removeUpdateListener = window.api?.onUpdateStatus?.(
      (_, data: { status: string; message: string; version?: string; percent?: number }) => {
        // Show update overlay when update is in progress
        if (
          data.status === 'checking' ||
          data.status === 'downloading' ||
          data.status === 'installing'
        ) {
          setShowUpdateOverlay(true)
        }
        // Hide update overlay when done or no update
        if (data.status === 'no-update' || data.status === 'done' || data.status === 'error') {
          setShowUpdateOverlay(false)
        }
      }
    )

    // Listen to server status changes
    const removeListener = window.api?.onServerStatusChange?.(
      (_, data: { status: string; message: string }) => {
        setServerStatus(data as ServerStatus)
        if (data.status === 'ready') {
          setTimeout(() => {
            onServerReady()
          }, 1000) // Small delay to show the ready message
        }
      }
    )

    return () => {
      removeListener?.()
      removeUpdateListener?.()
    }
  }, [onServerReady])

  // Animate dots for loading states
  useEffect(() => {
    if (serverStatus.status === 'starting') {
      const interval = setInterval(() => {
        setDots((prev) => {
          if (prev === '...') return ''
          return prev + '.'
        })
      }, 500)

      return () => clearInterval(interval)
    }
    return undefined
  }, [serverStatus.status])

  const getStatusColor = (): string => {
    switch (serverStatus.status) {
      case 'starting':
        return 'text-primary'
      case 'ready':
        return 'text-green-600 dark:text-green-400'
      case 'error':
        return 'text-destructive'
      case 'stopped':
        return 'text-yellow-600 dark:text-yellow-400'
      default:
        return 'text-muted-foreground'
    }
  }

  const getStatusIcon = (): React.JSX.Element => {
    switch (serverStatus.status) {
      case 'starting':
        return (
          <div className="rounded-full h-8 w-8 bg-primary/10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          </div>
        )
      case 'ready':
        return (
          <div className="rounded-full h-8 w-8 bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
        )
      case 'error':
        return (
          <div className="rounded-full h-8 w-8 bg-destructive/10 flex items-center justify-center">
            <XCircle className="h-5 w-5 text-destructive" />
          </div>
        )
      default:
        return (
          <div className="rounded-full h-8 w-8 bg-muted flex items-center justify-center">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
        )
    }
  }

  const handleRetry = async (): Promise<void> => {
    setServerStatus({ status: 'starting', message: 'Retrying server startup...' })
    // The main process will handle restarting the server
    window.location.reload()
  }

  // Don't show server startup screen if update is in progress
  if (showUpdateOverlay) {
    return <div className="min-h-screen bg-background"></div>
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          {/* <div className="flex justify-center mb-4">
            <div className="rounded-full p-3 bg-primary/10 border border-primary/20">
              <Shield className="w-12 h-12 text-primary" />
            </div>
          </div> */}
          <CardTitle className="text-xl font-semibold">Content Portal</CardTitle>
          <CardDescription>Starting up the application...</CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-2">
          <div className="flex items-center justify-center space-x-3">
            {getStatusIcon()}
            <div className="flex flex-col items-start">
              <span className={`font-medium ${getStatusColor()}`}>
                {serverStatus.status === 'starting' && 'Starting'}
                {serverStatus.status === 'ready' && 'Ready'}
                {serverStatus.status === 'error' && 'Error'}
                {serverStatus.status === 'stopped' && 'Stopped'}
                {serverStatus.status === 'starting' && dots}
              </span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{serverStatus.message}</p>

          {serverStatus.status === 'error' && (
            <div className="mt-4">
              <Button onClick={handleRetry} variant="outline" className="w-full">
                <RotateCcw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-4">
            Please wait while the Content Orchestrator service starts up...
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
