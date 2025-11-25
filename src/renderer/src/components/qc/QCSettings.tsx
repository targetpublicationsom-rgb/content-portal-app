import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { X, Plus, Play, Square, CheckCircle, XCircle } from 'lucide-react'
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
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<{
    success: boolean
    message: string
  } | null>(null)
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

  const handleSaveConfig = async (): Promise<void> => {
    if (!config) return

    try {
      setSaving(true)
      await qcService.updateConfig(config)
      await loadWatcherStatus()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async (): Promise<void> => {
    try {
      setTesting(true)
      const result = await qcService.testConnection()
      setConnectionStatus({
        success: result.success,
        message: result.data?.message || (result.success ? 'Connected' : 'Failed')
      })
    } catch (err) {
      setConnectionStatus({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed'
      })
    } finally {
      setTesting(false)
    }
  }

  const handleAddFolder = async (): Promise<void> => {
    const result = await window.api.dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const folder = result.filePaths[0]
      try {
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
          <CardTitle>Watch Folders</CardTitle>
          <CardDescription>Folders to monitor for new DOCX files</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {config.watchFolders.map((folder) => (
              <div key={folder} className="flex items-center justify-between p-3 border rounded-md">
                <span className="text-sm font-mono truncate flex-1">{folder}</span>
                <Button variant="ghost" size="sm" onClick={() => handleRemoveFolder(folder)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleAddFolder}>
              <Plus className="h-4 w-4 mr-2" />
              Add Folder
            </Button>
            {watcherStatus && (
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* External API Settings */}
      <Card>
        <CardHeader>
          <CardTitle>External QC API</CardTitle>
          <CardDescription>Configuration for the external quality check service</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiUrl">API URL</Label>
            <Input
              id="apiUrl"
              value={config.apiUrl}
              onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
              placeholder="https://api.example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="Enter API key"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleTestConnection} disabled={testing}>
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
            {connectionStatus && (
              <div className="flex items-center gap-2">
                {connectionStatus.success ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="text-sm text-green-600">
                      {connectionStatus.message || 'Connected'}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-500" />
                    <span className="text-sm text-red-600">
                      {connectionStatus.message || 'Failed'}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Advanced Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Advanced Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pollingInterval">Polling Interval (ms)</Label>
              <Input
                id="pollingInterval"
                type="number"
                value={config.pollingInterval}
                onChange={(e) =>
                  setConfig({ ...config, pollingInterval: parseInt(e.target.value) || 5000 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxRetries">Max Retries</Label>
              <Input
                id="maxRetries"
                type="number"
                value={config.maxRetries}
                onChange={(e) => setConfig({ ...config, maxRetries: parseInt(e.target.value) || 3 })}
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="autoSubmit"
              checked={config.autoSubmit}
              onChange={(e) => setConfig({ ...config, autoSubmit: e.target.checked })}
              className="h-4 w-4"
            />
            <Label htmlFor="autoSubmit">Auto-submit files for QC</Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSaveConfig} disabled={saving}>
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  )
}
