import { useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

interface UpdateStatus {
  status: 'idle' | 'checking' | 'downloading' | 'downloaded' | 'installing' | 'no-update' | 'error'
  message: string
  version?: string
  percent?: number
}

export default function UpdateOverlay(): React.JSX.Element | null {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Listen to update status changes
    const removeListener = window.api?.onUpdateStatus?.(
      (_, data: { status: string; message: string; version?: string; percent?: number }) => {
        const status = data.status as UpdateStatus['status']
        
        // Show overlay for active update states
        if (status === 'checking' || status === 'downloading' || status === 'downloaded' || status === 'installing') {
          setUpdateStatus(data as UpdateStatus)
          setIsVisible(true)
        }
        
        // Hide overlay for completion states
        if (status === 'no-update' || status === 'idle') {
          setIsVisible(false)
          setUpdateStatus(null)
        }
        
        // Show error briefly then hide
        if (status === 'error') {
          setUpdateStatus(data as UpdateStatus)
          setIsVisible(true)
          setTimeout(() => {
            setIsVisible(false)
            setUpdateStatus(null)
          }, 2000)
        }
      }
    )

    return () => removeListener?.()
  }, [])

  if (!updateStatus || !isVisible) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background backdrop-blur-sm">
      <Card className="w-full max-w-lg mx-4 shadow-2xl">
        <CardHeader className="text-2xl">
          <CardTitle className="flex items-center gap-2">
            <Download className="h-6 w-6 text-blue-600" />
            Application Update
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center space-y-3">
            <CardDescription>
              {updateStatus.version && `Version ${updateStatus.version}`}
            </CardDescription>
            <p className="text-lg font-medium">{updateStatus.message}</p>

            {updateStatus.percent !== undefined && updateStatus.status === 'downloading' && (
              <div className="space-y-2">
                <div className="w-full bg-secondary rounded-full h-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-in-out"
                    style={{ width: `${updateStatus.percent}%` }}
                  ></div>
                </div>
              </div>
            )}

            {updateStatus.status === 'installing' && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <p className="text-sm">Please wait, this will take a moment...</p>
              </div>
            )}
          </div>

          <div className="text-center text-xs text-muted-foreground pt-4 border-t">
            <p>Please do not close the application</p>
            <p>The app will restart automatically when the update is complete</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
