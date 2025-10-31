import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ArrowLeft, FileText } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import {
  getJobStateBadgeStyles,
  getGateStatusBadgeStyles,
  getStageStatusBadgeStyles
} from '../lib/badge-utils'
import type { JobDetails as JobDetailsType } from '../types'

export default function JobDetails(): React.JSX.Element {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState<JobDetailsType | null>(null)
  const [loading, setLoading] = useState(true)
  const [showLogModal, setShowLogModal] = useState(false)
  const [selectedLog, setSelectedLog] = useState<{ content: string; stageName: string } | null>(
    null
  )

  useEffect(() => {
    const fetchJobDetails = async (): Promise<void> => {
      try {
        const serverInfo = await window.api.getServerInfo()
        if (serverInfo?.port) {
          const response = await fetch(`http://127.0.0.1:${serverInfo.port}/jobs/${jobId}`)
          if (response.ok) {
            const data = await response.json()
            setJob(data)
          }
        }
      } catch (error) {
        console.error('Failed to fetch job details:', error)
      } finally {
        setLoading(false)
      }
    }

    if (jobId) {
      fetchJobDetails()
    }
  }, [jobId])

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading job details...</div>
  }

  if (!job) {
    return <div className="flex items-center justify-center p-8">Job not found</div>
  }

  return (
    <div className="flex-1 flex flex-col pb-12 min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="px-4 py-2 text-sm font-medium hover:bg-muted/50 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                Job Details
              </h1>
              <p className="text-md text-muted-foreground font-mono">{job.job_id}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 space-y-8 max-w-7xl mx-auto w-full">
        {/* Job Information Card */}
        <div className="bg-card rounded-xl border shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-6 text-foreground flex items-center gap-2">
            Job Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Job Status
              </label>
              <div className="mt-1">
                <Badge
                  variant="outline"
                  className={`text-sm px-3 py-1.5 font-semibold ${getJobStateBadgeStyles(job.state)}`}
                >
                  {job.state.toLocaleUpperCase()}
                </Badge>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Gate Status
              </label>
              <div className="mt-1">
                <Badge
                  variant="outline"
                  className={`text-sm px-3 py-1.5 font-semibold ${getGateStatusBadgeStyles(job.gate_passed)}`}
                >
                  Gate {job.gate_passed ? 'passed' : 'failed'}
                </Badge>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Format
              </label>
              <p className="text-lg font-medium capitalize">{job.format.replace('-', ' ')}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Stream
              </label>
              <p className="text-lg font-medium">{job.stream_name || 'Not specified'}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Standard
              </label>
              <p className="text-lg font-medium">{job.standard_name || 'Not specified'}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Subject
              </label>
              <p className="text-lg font-medium">{job.subject_name || 'Not specified'}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Created
              </label>
              <p className="text-lg font-medium">
                {new Date(job.created_at).toLocaleDateString()} at{' '}
                {new Date(job.created_at).toLocaleTimeString()}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Last Updated
              </label>
              <p className="text-lg font-medium">
                {new Date(job.updated_at).toLocaleDateString()} at{' '}
                {new Date(job.updated_at).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>

        {/* Processing Stages Section */}
        <div className="bg-card rounded-xl border shadow-sm p-6">
          <h2 className="text-2xl font-semibold mb-6 text-foreground flex items-center gap-2">
            Processing Stages
          </h2>
          <div className="border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Started At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ended At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Logs
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {job.stages.map((stage, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div className="flex items-center">{stage.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Badge
                        variant="outline"
                        className={`capitalize font-medium ${getStageStatusBadgeStyles(stage.status)}`}
                      >
                        {stage.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {stage.metrics?.duration_sec?.toFixed(1)}s
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {stage.started_at && new Date(stage.started_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {stage.ended_at && new Date(stage.ended_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {stage.log_path && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-0 h-auto"
                          onClick={async () => {
                            try {
                              const content = await window.api.readLogFile(stage.log_path!)
                              setSelectedLog({ content, stageName: stage.name })
                              setShowLogModal(true)
                            } catch (error) {
                              console.error('Failed to read log file:', error)
                            }
                          }}
                        >
                          <FileText className="h-4 w-4 text-gray-500 hover:text-gray-700" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {/* Log Modal */}
      <Dialog open={showLogModal} onOpenChange={setShowLogModal}>
        <DialogContent className="max-w-[800px] h-[80vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Log: {selectedLog?.stageName}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            <pre className="h-full p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap overflow-y-auto">
              {selectedLog?.content}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
