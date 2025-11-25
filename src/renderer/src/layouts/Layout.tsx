import { Outlet, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Briefcase, FileCheck } from 'lucide-react'
import StatusBar from '../components/StatusBar'

export default function Layout(): React.JSX.Element {
  const location = useLocation()

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/jobs', label: 'Jobs', icon: Briefcase },
    { path: '/qc', label: 'QC', icon: FileCheck }
  ]

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-52 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold">Content Portal</h1>
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
