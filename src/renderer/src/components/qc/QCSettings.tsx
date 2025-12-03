import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { X, Plus, Play, Square } from 'lucide-react'
import { qcService } from '../../services/qc.service'
import type { QCConfig } from '../../types/qc.types'

export default function QCSettings(): React.JSX.Element {
  const location = useLocation()
  const [config, setConfig] = useState<QCConfig | null>(null)
  const [watcherStatus, setWatcherStatus] = useState<{
    isActive: boolean
    watchedFolders: string[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const navItems = [
    { path: '/qc', label: 'Dashboard' },
    { path: '/qc/files', label: 'Files' },
    { path: '/qc/settings', label: 'Settings' }
  ]

  useEffect(() => {
    loadConfig()
    loadWatcherStatus()
  }, [])

  const loadConfig = async (): Promise<void> => {
    try {
      const data = await qcService.getConfig()
      setConfig(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }

  const loadWatcherStatus = async (): Promise<void> => {
    try {
      const status = await qcService.getWatcherStatus()
      setWatcherStatus(status)
    } catch (err) {
      console.error('Failed to load watcher status:', err)
    }
  }

  const handleAddFolder = async (): Promise<void> => {
    const result = await window.api.dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const folder = result.filePaths[0]
      try {
        // If folder already exists, remove it first
        if (config && config.watchFolders.length > 0) {
          await qcService.removeWatchFolder(config.watchFolders[0])
        }
        await qcService.addWatchFolder(folder)
        await loadConfig()
        await loadWatcherStatus()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add folder')
      }
    }
  }

  const handleRemoveFolder = async (folder: string): Promise<void> => {
    try {
      await qcService.removeWatchFolder(folder)
      await loadConfig()
      await loadWatcherStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove folder')
    }
  }

  const handleToggleWatcher = async (): Promise<void> => {
    try {
      if (watcherStatus?.isActive) {
        await qcService.stopWatcher()
      } else {
        await qcService.startWatcher()
      }
      // Wait a moment for watcher to initialize
      setTimeout(() => {
        loadWatcherStatus()
      }, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle watcher')
    }
  }

  if (loading || !config) {
    return <div className="p-8">Loading...</div>
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

      <div>
        <h1 className="text-3xl font-bold">QC Settings</h1>
        <p className="text-muted-foreground mt-1">Configure quality check automation</p>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Watch Folders */}
      <Card>
        <CardHeader>
          <CardTitle>Watch Folder</CardTitle>
          <CardDescription>
            Folder to monitor for new DOCX files. The database will be automatically created in{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">[folder]/.qc/qc.db</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.watchFolders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No watch folder configured.</p>
              <p className="text-sm mt-1">Add a folder to start monitoring for files.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {config.watchFolders.map((folder) => (
                <div
                  key={folder}
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <span className="text-sm font-mono truncate flex-1">{folder}</span>
                  <Button variant="ghost" size="sm" onClick={() => handleRemoveFolder(folder)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            {config.watchFolders.length === 0 ? (
              <Button onClick={handleAddFolder}>
                <Plus className="h-4 w-4 mr-2" />
                Add Folder
              </Button>
            ) : (
              <Button onClick={handleAddFolder} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Change Folder
              </Button>
            )}
            {watcherStatus && config.watchFolders.length > 0 && (
              <Button
                onClick={handleToggleWatcher}
                variant={watcherStatus.isActive ? 'destructive' : 'default'}
              >
                {watcherStatus.isActive ? (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Stop Watching
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Start Watching
                  </>
                )}
              </Button>
            )}
          </div>
          {watcherStatus && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Badge
                variant={watcherStatus.isActive ? 'default' : 'secondary'}
                className={watcherStatus.isActive ? 'bg-green-500' : ''}
              >
                {watcherStatus.isActive ? 'Active' : 'Inactive'}
              </Badge>
              {watcherStatus.watchedFolders.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  (1 folder)
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
