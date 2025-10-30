import { RouterProvider } from 'react-router-dom'
import { useState, useEffect } from 'react'
import StatusBar from './components/StatusBar'
import ServerStartup from './components/ServerStartup'
import { Toaster } from 'react-hot-toast'
import { router } from './router'

function App(): React.JSX.Element {
  const [serverReady, setServerReady] = useState(false)
  const [initialCheckComplete, setInitialCheckComplete] = useState(false)

  useEffect(() => {
    const checkServerStatus = async (): Promise<void> => {
      try {
        const isRunning = await window.api?.isServerRunning()
        if (isRunning) {
          setServerReady(true)
        }
      } catch (error) {
        console.error('Error checking server status:', error)
      } finally {
        setInitialCheckComplete(true)
      }
    }

    checkServerStatus()
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

  // Show server startup screen if server is not ready
  if (!serverReady) {
    return <ServerStartup onServerReady={handleServerReady} />
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
