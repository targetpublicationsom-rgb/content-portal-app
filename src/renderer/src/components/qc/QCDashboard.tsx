import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { FileCheck, FileWarning, Clock, CheckCircle2, Loader2, Play, Square } from 'lucide-react'
import { qcService } from '../../services/qc.service'
import type { QCStats } from '../../types/qc.types'

export default function QCDashboard(): React.JSX.Element {
  const location = useLocation()
  const [stats, setStats] = useState<QCStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [watcherActive, setWatcherActive] = useState(false)
  const [watcherLoading, setWatcherLoading] = useState(false)

  const navItems = [
    { path: '/qc', label: 'Dashboard' },
    { path: '/qc/files', label: 'Files' }
  ]

  useEffect(() => {
    loadStats()
    loadWatcherStatus()
    const interval = setInterval(() => {
      loadStats()
      loadWatcherStatus()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadWatcherStatus = async (): Promise<void> => {
    try {
      const status = await qcService.getWatcherStatus()
      setWatcherActive(status.isActive)
    } catch (err) {
      console.error('Failed to load watcher status:', err)
    }
  }

  const handleToggleWatcher = async (): Promise<void> => {
    try {
      setWatcherLoading(true)
      if (watcherActive) {
        await qcService.stopWatcher()
      } else {
        await qcService.startWatcher()
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
      await loadWatcherStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle watcher')
    } finally {
      setWatcherLoading(false)
    }
  }

  const loadStats = async (): Promise<void> => {
    try {
      const data = await qcService.getStats()
      setStats(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load statistics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Navigation Tabs */}
      <div className="flex items-center gap-4 border-b pb-4">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              location.pathname === item.path
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Quality Check Dashboard</h1>
          <p className="text-muted-foreground mt-1">Monitor automated document quality checks</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge
              variant={watcherActive ? 'default' : 'secondary'}
              className={watcherActive ? 'bg-green-500' : ''}
            >
              {watcherActive ? 'Watching' : 'Stopped'}
            </Badge>
          </div>
          <Button
            onClick={handleToggleWatcher}
            disabled={watcherLoading}
            variant={watcherActive ? 'destructive' : 'default'}
            size="lg"
          >
            {watcherActive ? (
              <>
                <Square className="h-5 w-5 mr-2" />
                Stop Watching
              </>
            ) : (
              <>
                <Play className="h-5 w-5 mr-2" />
                Start Watching
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total QC Records</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.todayCompleted || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 24 hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className=\"flex flex-row items-center justify-between space-y-0 pb-2\">
            <CardTitle className=\"text-sm font-medium\">Avg Processing Time</CardTitle>
            <Clock className=\"h-4 w-4 text-muted-foreground\" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.avgProcessingTime ? Math.round(stats.avgProcessingTime) : '—'}s
            </div>
            <p className="text-xs text-muted-foreground mt-1">Per document</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Status Breakdown</CardTitle>
          <CardDescription>Current status of all QC records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="flex flex-col space-y-2">
              <span className="text-sm font-medium text-muted-foreground">Queued</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{stats?.queued || 0}</Badge>
              </div>
            </div>
            <div className="flex flex-col space-y-2">
              <span className="text-sm font-medium text-muted-foreground">Converting</span>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-blue-500">
                  {stats?.converting || 0}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col space-y-2">
              <span className="text-sm font-medium text-muted-foreground">Processing</span>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-yellow-500">
                  {stats?.processing || 0}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col space-y-2">
              <span className="text-sm font-medium text-muted-foreground">Completed</span>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-500">
                  {stats?.completed || 0}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col space-y-2">
              <span className="text-sm font-medium text-muted-foreground">Failed</span>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">{stats?.failed || 0}</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
