import Dashboard from './components/Dashboard'
import StatusBar from './components/StatusBar'

function App(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <Dashboard />
      <StatusBar />
    </div>
  )
}

export default App
