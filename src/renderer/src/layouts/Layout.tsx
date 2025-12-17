import { Outlet, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, LogOut, FileCheck, ListChecks } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button'
import StatusBar from '../components/StatusBar'
import api from '../lib/axios'
import toast from 'react-hot-toast'

interface User {
  id: number
  email: string
  name?: string
}

export default function Layout(): React.JSX.Element {
  const location = useLocation()
  const [user, setUser] = useState<User | null>(null)

  // Fetch user data on mount if not in localStorage
  useEffect(() => {
    const fetchUser = async (): Promise<void> => {
      const userStr = localStorage.getItem('user')
      if (userStr) {
        try {
          setUser(JSON.parse(userStr))
        } catch (error) {
          console.error('Failed to parse user data:', error)
        }
      } else {
        // Fetch from API if not in localStorage
        try {
          const response = await api.get('/auth/me')
          if (response.data) {
            setUser(response.data)
            localStorage.setItem('user', JSON.stringify(response.data))
          }
        } catch (error) {
          console.error('Failed to fetch user:', error)
        }
      }
    }

    fetchUser()
  }, [])

  const handleLogout = async (): Promise<void> => {
    try {
      await api.post('/auth/logout')
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      // Clear storage regardless of API response
      localStorage.removeItem('auth_token') // Legacy key
      localStorage.removeItem('auth_token_data') // New key with timestamp
      localStorage.removeItem('user')
      await window.api.clearAuthToken()
      toast.success('Logged out successfully')
      window.location.hash = '/login'
    }
  }

  const navItems = [
    { path: '/uploader', label: 'Question Uploader', icon: LayoutDashboard },
    { path: '/qc', label: 'QC', icon: FileCheck },
    { path: '/numbering-checker', label: 'Numbering Checker', icon: ListChecks }
  ]

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-52 border-r bg-card flex flex-col pb-10">
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold">Content Portal</h1>
          {user?.email && <p className="text-xs text-muted-foreground mt-1">{user.email}</p>}
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            // Check if current path starts with the item path (except for root path)
            // For /uploader, it should match /uploader, /uploader/jobs, etc.
            const isActive =
              location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path))

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${isActive
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
          <Button variant="outline" className="w-full justify-start" onClick={handleLogout}>
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
