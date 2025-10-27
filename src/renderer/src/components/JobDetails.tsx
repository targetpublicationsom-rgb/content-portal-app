import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ArrowLeft, FileText } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'

interface Stage {
  name: string
  status: string
  started_at: string
  ended_at: string
  metrics: {
    duration_sec: number
  }
  log_path: string
}

interface JobDetails {
  job_id: string
  format: 'single' | 'two-file'
  state: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'
  gate_passed: boolean
  gate_report_url: string
  created_at: string
  updated_at: string
  workspace: string
  report_url: string
  stages: Stage[]
  stream_id: number | null
  stream_name: string | null
  standard_id: number | null
  standard_name: string | null
  subject_id: number | null
  subject_name: string | null
}

export default function JobDetails(): React.JSX.Element {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState<JobDetails | null>(null)
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
    <div className="flex-1 flex flex-col pb-12">
      <div className="flex w-full items-center justify-between border-b p-4 bg-card">
        <div className="flex items-center gap-1">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft size={24} />
          </Button>
          <h1 className="text-2xl font-bold">Job Details</h1>
        </div>
      </div>

      <div className="flex-1 p-4">
        <div className="w-full rounded-lg border bg-card shadow-sm p-6">
          <div className="space-y-6">
            {/* Basic Info */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Job ID</label>
                  <p className="mt-1 font-mono">{job.job_id}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Format</label>
                  <p className="mt-1 capitalize">{job.format.replace('-', ' ')}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Stream</label>
                  <p className="mt-1">{job.stream_name || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Standard</label>
                  <p className="mt-1">{job.standard_name || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Subject</label>
                  <p className="mt-1">{job.subject_name || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">State</label>
                  <div className="mt-1">
                    <Badge
                      variant="outline"
                      className={`capitalize font-medium ${
                        job.state === 'DONE'
                          ? 'bg-green-50 text-green-700'
                          : job.state === 'FAILED'
                            ? 'bg-red-50 text-red-700'
                            : job.state === 'PROCESSING'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-yellow-50 text-yellow-700'
                      }`}
                    >
                      {job.state.toLowerCase()}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Gate Status</label>
                  <div className="mt-1">
                    <Badge
                      variant="outline"
                      className={`capitalize font-medium ${
                        job.gate_passed
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          : 'bg-rose-50 text-rose-700 border-rose-100'
                      }`}
                    >
                      Gate {job.gate_passed ? 'passed' : 'failed'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Timestamps */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Timestamps</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Created At</label>
                  <p className="mt-1">{new Date(job.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Updated At</label>
                  <p className="mt-1">{new Date(job.updated_at).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Stages */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Processing Stages</h2>
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
                            className={`capitalize font-medium ${
                              stage.status === 'ok'
                                ? 'bg-green-50 text-green-700'
                                : 'bg-red-50 text-red-700'
                            }`}
                          >
                            {stage.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {stage.metrics.duration_sec.toFixed(1)}s
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(stage.started_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(stage.ended_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {stage.log_path && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-0 h-auto"
                              onClick={async () => {
                                try {
                                  const content = await window.api.readLogFile(stage.log_path)
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
