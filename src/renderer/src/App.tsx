import Dashboard from './components/Dashboard'
import StatusBar from './components/StatusBar'
import { Toaster } from 'react-hot-toast'

function App(): React.JSX.Element {
  return (
    <div className="min-h-screen flex flex-col bg-background container mx-auto px-4">
      <div className="flex-1 flex flex-col">
        <Dashboard />
      </div>
      <StatusBar />
      <Toaster position="top-center" reverseOrder={false} />
    </div>
  )
}

export default App
