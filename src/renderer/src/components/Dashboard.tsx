import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import type { DashboardStats } from '../types'
import { fetchDashboardStats } from '../services'
import { Clock, CheckCircle2, XCircle, Upload, TrendingUp, Activity } from 'lucide-react'

export default function Dashboard(): React.JSX.Element {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [serverPort, setServerPort] = useState<number>()

  useEffect(() => {
    const init = async (): Promise<void> => {
      const serverInfo = await window.api.getServerInfo()
      if (serverInfo?.port) {
        setServerPort(serverInfo.port)
        loadStats(serverInfo.port)
      }
    }
    init()
  }, [])

  const loadStats = async (port: number): Promise<void> => {
    try {
      setLoading(true)
      const data = await fetchDashboardStats(port)
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col p-3 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your content processing pipeline</p>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Failed to load dashboard stats</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-3 space-y-6 overflow-auto custom-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your content processing pipeline</p>
        </div>
        <button
          onClick={() => serverPort && loadStats(serverPort)}
          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border rounded-md hover:bg-accent"
        >
          Refresh
        </button>
      </div>

      {/* Total Stats */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Total Statistics</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totals.all.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Queued</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totals.queued.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Running</CardTitle>
              <TrendingUp className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totals.running.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Succeeded</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totals.succeeded.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totals.failed.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Uploaded</CardTitle>
              <Upload className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totals.uploaded.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Today's Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Today</CardTitle>
            <CardDescription>Activity in the last 24 hours</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-2xl font-bold">{stats.today.created}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Succeeded</span>
              <span className="text-2xl font-bold text-green-600">{stats.today.succeeded}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Failed</span>
              <span className="text-2xl font-bold text-red-600">{stats.today.failed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Uploaded</span>
              <span className="text-2xl font-bold text-purple-600">{stats.today.uploaded}</span>
            </div>
          </CardContent>
        </Card>

        {/* Week's Stats */}
        <Card>
          <CardHeader>
            <CardTitle>This Week</CardTitle>
            <CardDescription>Activity in the last 7 days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-2xl font-bold">{stats.week.created}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Succeeded</span>
              <span className="text-2xl font-bold text-green-600">{stats.week.succeeded}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Failed</span>
              <span className="text-2xl font-bold text-red-600">{stats.week.failed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Uploaded</span>
              <span className="text-2xl font-bold text-purple-600">{stats.week.uploaded}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* By Stream */}
      {/* <Card>
        <CardHeader>
          <CardTitle>Jobs by Stream</CardTitle>
          <CardDescription>Distribution of jobs across different streams</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.by_stream.map((stream) => (
              <div key={stream.stream_id} className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">{stream.name}</span>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{
                        width: `${(stream.count / stats.totals.all) * 100}%`
                      }}
                    />
                  </div>
                  <span className="text-2xl font-bold w-20 text-right">
                    {stream.count.toLocaleString()}
                  </span>
                  <span className="text-sm text-muted-foreground w-12 text-right">
                    {((stream.count / stats.totals.all) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card> */}
    </div>
  )
}
