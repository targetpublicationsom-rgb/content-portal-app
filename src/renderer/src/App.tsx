import { RouterProvider } from 'react-router-dom'
import StatusBar from './components/StatusBar'
import { Toaster } from 'react-hot-toast'
import { router } from './router'

function App(): React.JSX.Element {
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
