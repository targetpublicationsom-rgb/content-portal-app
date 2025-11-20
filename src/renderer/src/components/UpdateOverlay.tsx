import { useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

interface UpdateStatus {
  status: 'checking' | 'downloading' | 'installing'
  message: string
  version?: string
  percent?: number
}

export default function UpdateOverlay(): React.JSX.Element | null {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Check if there's an ongoing update when component mounts
    const checkInitialStatus = async (): Promise<void> => {
      try {
        const status = await window.api?.getUpdateStatus?.()
        if (
          status &&
          (status.status === 'checking' ||
            status.status === 'downloading' ||
            status.status === 'installing')
        ) {
          setUpdateStatus(status as UpdateStatus)
          setIsVisible(true)
          console.log('[UpdateOverlay] Found existing update status:', status)
        }
      } catch (error) {
        console.error('[UpdateOverlay] Failed to get initial update status:', error)
      }
    }

    checkInitialStatus()

    // Listen to update status changes
    const removeListener = window.api?.onUpdateStatus?.(
      (_, data: { status: string; message: string; version?: string; percent?: number }) => {
        console.log('[UpdateOverlay] Received update status:', data)
        const status = data.status as UpdateStatus['status']
        if (status === 'checking' || status === 'downloading' || status === 'installing') {
          setUpdateStatus(data as UpdateStatus)
          setIsVisible(true)
        }
      }
    )

    return () => removeListener?.()
  }, [])

  if (!updateStatus || !isVisible) {
    console.log(
      '[UpdateOverlay] Not showing overlay - updateStatus:',
      updateStatus,
      'isVisible:',
      isVisible
    )
    return null
  }

  console.log('[UpdateOverlay] Showing overlay with status:', updateStatus)
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
