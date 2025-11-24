import { RouterProvider } from 'react-router-dom'
import { useState, useEffect } from 'react'
import StatusBar from './components/StatusBar'
import ServerStartup from './components/ServerStartup'
import UpdateOverlay from './components/UpdateOverlay'
import { Toaster, toast } from 'react-hot-toast'
import { router } from './router'

function App(): React.JSX.Element {
  const [serverReady, setServerReady] = useState(false)
  const [initialCheckComplete, setInitialCheckComplete] = useState(false)
  const [updateInProgress, setUpdateInProgress] = useState(false)

  useEffect(() => {
    const checkServerStatus = async (): Promise<void> => {
      try {
        const isRunning = await window.api?.isServerRunning()
        if (isRunning) {
          setServerReady(true)
        }
      } catch {
        // Silently handle server status check errors
      } finally {
        setInitialCheckComplete(true)
      }
    }

    // IPC listener for quit blocked toast
    const handleQuitBlocked = (_event: any, data: { message: string }) => {
      toast.error(data.message, {
        duration: 5000
      })
    }

    // IPC listener for update status
    const handleUpdateStatus = (_event: any, data: { status: string }) => {
      // Track if update is actively in progress (downloading or installing)
      const inProgress =
        data.status === 'downloading' ||
        data.status === 'downloaded' ||
        data.status === 'installing'
      setUpdateInProgress(inProgress)
    }

    // Set up IPC listeners
    const removeQuitBlockedListener = window.api?.onQuitBlocked?.(handleQuitBlocked)
    const removeUpdateListener = window.api?.onUpdateStatus?.(handleUpdateStatus)

    checkServerStatus()

    // Cleanup listener on component unmount
    return () => {
      removeQuitBlockedListener?.()
      removeUpdateListener?.()
    }
  }, [])

  const handleServerReady = (): void => {
    setServerReady(true)
  }

  // Show loading until initial check is complete
  if (!initialCheckComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Show server startup screen if server is not ready and no update in progress
  if (!serverReady) {
    // Show only update overlay during update, hide server startup
    if (updateInProgress) {
      return <UpdateOverlay />
    }
    
    return (
      <>
        <UpdateOverlay />
        <ServerStartup onServerReady={handleServerReady} />
      </>
    )
  }

  // Show main app when server is ready
  return (
    <div className="min-h-screen flex flex-col bg-background container mx-auto px-4">
      <div className="flex-1 flex flex-col">
        <RouterProvider router={router} />
      </div>
      <StatusBar />
      <Toaster position="top-center" reverseOrder={false} />
    </div>
  )
}

export default App
