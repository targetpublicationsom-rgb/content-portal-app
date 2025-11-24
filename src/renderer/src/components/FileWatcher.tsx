import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Play, Square, Trash2, FolderOpen, FileText, FolderPlus, FilePlus } from 'lucide-react'
import toast from 'react-hot-toast'

interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
  filename: string
  timestamp: string
}

interface WatcherStatus {
  isWatching: boolean
  watchPath: string | null
  eventCount: number
}

export default function FileWatcher(): React.JSX.Element {
  const [folderPath, setFolderPath] = useState('')
  const [status, setStatus] = useState<WatcherStatus>({
    isWatching: false,
    watchPath: null,
    eventCount: 0
  })
  const [events, setEvents] = useState<FileChangeEvent[]>([])
  const [loading, setLoading] = useState(false)

  // Load initial status
  useEffect(() => {
    loadStatus()
    loadEvents()
  }, [])

  // Listen for file watcher events
  useEffect(() => {
    const removeListener = window.api.onFileWatcherEvent((_, event) => {
      setEvents((prev) => [event, ...prev].slice(0, 100))
      setStatus((prev) => ({ ...prev, eventCount: prev.eventCount + 1 }))
    })

    const removeErrorListener = window.api.onFileWatcherError((_, message) => {
      toast.error(`File Watcher Error: ${message}`)
    })

    return () => {
      removeListener()
      removeErrorListener()
    }
  }, [])

  const loadStatus = async (): Promise<void> => {
    try {
      const watcherStatus = await window.api.getWatcherStatus()
      setStatus(watcherStatus)
      if (watcherStatus.watchPath) {
        setFolderPath(watcherStatus.watchPath)
      }
    } catch (error) {
      console.error('Failed to load watcher status:', error)
    }
  }

  const loadEvents = async (): Promise<void> => {
    try {
      const recentEvents = await window.api.getRecentEvents(100)
      setEvents(recentEvents)
    } catch (error) {
      console.error('Failed to load events:', error)
    }
  }

  const handleStart = async (): Promise<void> => {
    if (!folderPath.trim()) {
      toast.error('Please enter a folder path')
      return
    }

    setLoading(true)
    try {
      const result = await window.api.startFileWatcher(folderPath.trim())
      if (result.success) {
        toast.success(result.message)
        await loadStatus()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error('Failed to start watching')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.api.stopFileWatcher()
      if (result.success) {
        toast.success(result.message)
        await loadStatus()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error('Failed to stop watching')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleClearEvents = async (): Promise<void> => {
    try {
      await window.api.clearWatcherEvents()
      setEvents([])
      setStatus((prev) => ({ ...prev, eventCount: 0 }))
      toast.success('Events cleared')
    } catch (error) {
      toast.error('Failed to clear events')
      console.error(error)
    }
  }

  const getEventIcon = (type: string): React.JSX.Element => {
    switch (type) {
      case 'add':
        return <FilePlus className="h-4 w-4 text-green-500" />
      case 'change':
        return <FileText className="h-4 w-4 text-blue-500" />
      case 'unlink':
        return <FileText className="h-4 w-4 text-red-500" />
      case 'addDir':
        return <FolderPlus className="h-4 w-4 text-green-500" />
      case 'unlinkDir':
        return <FolderOpen className="h-4 w-4 text-red-500" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const getEventBadge = (type: string): React.JSX.Element => {
    const badges = {
      add: <Badge variant="default" className="bg-green-500">Added</Badge>,
      change: <Badge variant="default" className="bg-blue-500">Changed</Badge>,
      unlink: <Badge variant="destructive">Deleted</Badge>,
      addDir: <Badge variant="default" className="bg-green-500">Dir Added</Badge>,
      unlinkDir: <Badge variant="destructive">Dir Deleted</Badge>
    }
    return badges[type] || <Badge>{type}</Badge>
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">File Watcher</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor file system changes in real-time
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            Watch a folder for file changes (supports network drives)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter folder path (e.g., C:\MyFolder or \\server\share)"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              disabled={status.isWatching || loading}
              className="flex-1"
            />
            {status.isWatching ? (
              <Button
                onClick={handleStop}
                disabled={loading}
                variant="destructive"
                className="gap-2"
              >
                <Square className="h-4 w-4" />
                Stop
              </Button>
            ) : (
              <Button onClick={handleStart} disabled={loading} className="gap-2">
                <Play className="h-4 w-4" />
                Start
              </Button>
            )}
          </div>

          {status.watchPath && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
              <FolderOpen className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Currently watching:</span>
              <code className="text-sm bg-background px-2 py-1 rounded">{status.watchPath}</code>
              <Badge variant={status.isWatching ? 'default' : 'secondary'} className="ml-auto">
                {status.isWatching ? 'Active' : 'Stopped'}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Events</CardTitle>
              <CardDescription>
                Last {events.length} file system changes
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearEvents}
              disabled={events.length === 0}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No events yet</p>
              <p className="text-sm">Start watching a folder to see changes</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {events.map((event, index) => (
                <div
                  key={`${event.timestamp}-${index}`}
                  className="flex items-start gap-3 p-3 bg-muted rounded-md hover:bg-muted/80 transition-colors"
                >
                  {getEventIcon(event.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getEventBadge(event.type)}
                      <span className="font-medium text-sm truncate">{event.filename}</span>
                    </div>
                    <code className="text-xs text-muted-foreground block truncate">
                      {event.path}
                    </code>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
