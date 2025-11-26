import { Outlet, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Briefcase, LogOut } from 'lucide-react'
import { Button } from '../components/ui/button'
import StatusBar from '../components/StatusBar'
import api from '../lib/axios'
import toast from 'react-hot-toast'

export default function Layout(): React.JSX.Element {
  const location = useLocation()
  
  const userStr = localStorage.getItem('user')
  const user = userStr ? JSON.parse(userStr) : null
  
  const handleLogout = async (): Promise<void> => {
    try {
      await api.post('/auth/logout')
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      // Clear storage regardless of API response
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user')
      await window.api.clearAuthToken()
      toast.success('Logged out successfully')
      window.location.hash = '/login'
    }
  }

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/jobs', label: 'Jobs', icon: Briefcase }
  ]

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-52 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold">Content Portal</h1>
          {user && <p className="text-xs text-muted-foreground mt-1">{user.email}</p>}
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="p-3 border-t">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
        <StatusBar />
      </div>
    </div>
  )
}
