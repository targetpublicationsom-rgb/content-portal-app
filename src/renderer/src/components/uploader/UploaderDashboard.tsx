import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import type { DashboardStats } from '../../types'
import { fetchDashboardStats } from '../../services'
import { Clock, CheckCircle2, XCircle, Upload, TrendingUp, Activity } from 'lucide-react'
import UploaderTabs from './UploaderTabs'

export default function UploaderDashboard(): React.JSX.Element {
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
        } catch {
            // Handle fetch error silently
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="p-8 space-y-6">
                <UploaderTabs />
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Question Uploader</h1>
                    <p className="text-muted-foreground">Overview of your content processing pipeline</p>
                </div>
            </div>
        )
    }

    if (!stats) {
        return (
            <div className="p-8 space-y-6">
                <UploaderTabs />
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-muted-foreground">Failed to load dashboard stats</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-col min-h-screen bg-gradient-to-br from-background via-background to-muted/20 overflow-auto custom-scrollbar">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
                <div className="flex items-center justify-between py-4 px-8">
                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                            Question Uploader
                        </h1>
                        <p className="text-md text-muted-foreground">
                            Overview of your content processing pipeline
                        </p>
                    </div>
                    <Button onClick={() => serverPort && loadStats(serverPort)} size="sm" className="gap-2">
                        <Activity className="h-4 w-4" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-8 space-y-8 max-w-7xl mx-auto w-full">
                {/* Navigation Tabs */}
                <UploaderTabs />

                {/* Total Stats */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold text-foreground">Total Statistics</h2>
                    </div>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                        <Card className="group hover:shadow-lg transition-all duration-200 hover:-translate-y-1 border-2 hover:border-blue-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                    Total Jobs
                                </CardTitle>
                                <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                                    <Activity className="h-5 w-5 text-blue-600" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-blue-600">
                                    {stats.totals.all.toLocaleString()}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">All time</p>
                            </CardContent>
                        </Card>

                        <Card className="group hover:shadow-lg transition-all duration-200 hover:-translate-y-1 border-2 hover:border-yellow-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                    Queued
                                </CardTitle>
                                <div className="p-2 bg-yellow-100 rounded-lg group-hover:bg-yellow-200 transition-colors">
                                    <Clock className="h-5 w-5 text-yellow-600" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-yellow-600">
                                    {stats.totals.queued.toLocaleString()}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Pending</p>
                            </CardContent>
                        </Card>

                        <Card className="group hover:shadow-lg transition-all duration-200 hover:-translate-y-1 border-2 hover:border-orange-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                    Running
                                </CardTitle>
                                <div className="p-2 bg-orange-100 rounded-lg group-hover:bg-orange-200 transition-colors">
                                    <TrendingUp className="h-5 w-5 text-orange-600" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-orange-600">
                                    {stats.totals.running.toLocaleString()}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">In progress</p>
                            </CardContent>
                        </Card>

                        <Card className="group hover:shadow-lg transition-all duration-200 hover:-translate-y-1 border-2 hover:border-green-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                    Succeeded
                                </CardTitle>
                                <div className="p-2 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-green-600">
                                    {stats.totals.succeeded.toLocaleString()}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Completed</p>
                            </CardContent>
                        </Card>

                        <Card className="group hover:shadow-lg transition-all duration-200 hover:-translate-y-1 border-2 hover:border-red-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                    Failed
                                </CardTitle>
                                <div className="p-2 bg-red-100 rounded-lg group-hover:bg-red-200 transition-colors">
                                    <XCircle className="h-5 w-5 text-red-600" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-red-600">
                                    {stats.totals.failed.toLocaleString()}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Errors</p>
                            </CardContent>
                        </Card>

                        <Card className="group hover:shadow-lg transition-all duration-200 hover:-translate-y-1 border-2 hover:border-purple-200">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                    Uploaded
                                </CardTitle>
                                <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                                    <Upload className="h-5 w-5 text-purple-600" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-purple-600">
                                    {stats.totals.uploaded.toLocaleString()}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Published</p>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold text-foreground">Recent Activity</h2>
                    </div>

                    <div className="grid gap-8 lg:grid-cols-2">
                        {/* Today's Stats */}
                        <Card className="group hover:shadow-xl transition-all duration-300 border-2 hover:border-blue-200 bg-gradient-to-br from-card to-card/80">
                            <CardHeader className="pb-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                                            Today
                                        </CardTitle>
                                        <CardDescription className="text-base">
                                            Activity in the last 24 hours
                                        </CardDescription>
                                    </div>
                                    <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                                        <Clock className="h-6 w-6 text-blue-600" />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-muted/30 rounded-lg p-4 hover:bg-muted/50 transition-colors">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                                            Created
                                        </span>
                                        <span className="text-2xl font-bold text-foreground">
                                            {stats.today.created}
                                        </span>
                                    </div>
                                    <div className="bg-green-50 rounded-lg p-4 hover:bg-green-100 transition-colors border border-green-100">
                                        <span className="text-xs font-semibold text-green-700 uppercase tracking-wider block mb-2">
                                            Succeeded
                                        </span>
                                        <span className="text-2xl font-bold text-green-700">
                                            {stats.today.succeeded}
                                        </span>
                                    </div>
                                    <div className="bg-red-50 rounded-lg p-4 hover:bg-red-100 transition-colors border border-red-100">
                                        <span className="text-xs font-semibold text-red-700 uppercase tracking-wider block mb-2">
                                            Failed
                                        </span>
                                        <span className="text-2xl font-bold text-red-700">{stats.today.failed}</span>
                                    </div>
                                    <div className="bg-purple-50 rounded-lg p-4 hover:bg-purple-100 transition-colors border border-purple-100">
                                        <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider block mb-2">
                                            Uploaded
                                        </span>
                                        <span className="text-2xl font-bold text-purple-700">
                                            {stats.today.uploaded}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Week's Stats */}
                        <Card className="group hover:shadow-xl transition-all duration-300 border-2 hover:border-green-200 bg-gradient-to-br from-card to-card/80">
                            <CardHeader className="pb-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                                            This Week
                                        </CardTitle>
                                        <CardDescription className="text-base">
                                            Activity in the last 7 days
                                        </CardDescription>
                                    </div>
                                    <div className="h-12 w-12 bg-green-100 rounded-xl flex items-center justify-center group-hover:bg-green-200 transition-colors">
                                        <TrendingUp className="h-6 w-6 text-green-600" />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-muted/30 rounded-lg p-4 hover:bg-muted/50 transition-colors">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                                            Created
                                        </span>
                                        <span className="text-2xl font-bold text-foreground">{stats.week.created}</span>
                                    </div>
                                    <div className="bg-green-50 rounded-lg p-4 hover:bg-green-100 transition-colors border border-green-100">
                                        <span className="text-xs font-semibold text-green-700 uppercase tracking-wider block mb-2">
                                            Succeeded
                                        </span>
                                        <span className="text-2xl font-bold text-green-700">
                                            {stats.week.succeeded}
                                        </span>
                                    </div>
                                    <div className="bg-red-50 rounded-lg p-4 hover:bg-red-100 transition-colors border border-red-100">
                                        <span className="text-xs font-semibold text-red-700 uppercase tracking-wider block mb-2">
                                            Failed
                                        </span>
                                        <span className="text-2xl font-bold text-red-700">{stats.week.failed}</span>
                                    </div>
                                    <div className="bg-purple-50 rounded-lg p-4 hover:bg-purple-100 transition-colors border border-purple-100">
                                        <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider block mb-2">
                                            Uploaded
                                        </span>
                                        <span className="text-2xl font-bold text-purple-700">
                                            {stats.week.uploaded}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    )
}
