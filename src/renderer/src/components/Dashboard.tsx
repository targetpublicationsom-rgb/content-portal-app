import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { useNavigate } from 'react-router-dom'
import UploadForm from './UploadForm'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import JobProgress from './JobProgress'
import { Eye, FileText, RefreshCcw, RotateCw, Upload } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import toast from 'react-hot-toast'

interface Job {
  job_id: string
  format: 'single' | 'two-file'
  state: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'RUNNING'
  gate_passed: boolean
  gate_report_url: string
  created_at: string
  updated_at: string
  report_url: string
  reason: string | null
  stream_id: string | null
  stream_name: string | null
  standard_id: string | null
  standard_name: string | null
  subject_id: string | null
  subject_name: string | null
}

interface JobsResponse {
  items: Job[]
  page: number
  page_size: number
  total: number
}

export default function Dashboard(): React.JSX.Element {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [serverPort, setServerPort] = useState<number>()
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [showReport, setShowReport] = useState(false)
  const [reportContent, setReportContent] = useState<string>('')
  const [reportTitle, setReportTitle] = useState('')
  const [showJobProgress, setShowJobProgress] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string>('')

  useEffect(() => {
    const init = async (): Promise<void> => {
      const serverInfo = await window.api.getServerInfo()
      if (serverInfo?.port) {
        setServerPort(serverInfo.port)
        fetchJobs()
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]) // Refetch when page changes

  const fetchJobs = async (): Promise<void> => {
    try {
      const serverInfo = await window.api.getServerInfo()
      if (serverInfo?.port) {
        const response = await fetch(
          `http://127.0.0.1:${serverInfo.port}/jobs?page=${currentPage}&page_size=${pageSize}`
        )
        if (response.ok) {
          const data: JobsResponse = await response.json()
          setJobs(data.items || [])
          setTotal(data.total)
        }
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePageChange = (page: number): void => {
    setCurrentPage(page)
  }

  const handleViewReport = async (filePath: string, title: string): Promise<void> => {
    try {
      const htmlContent = await window.api.readHtmlFile(filePath)
      setReportContent(htmlContent)
      setReportTitle(title)
      setShowReport(true)
    } catch (error) {
      console.error('Error reading HTML file:', error)
    }
  }

  const handleRerun = async (jobId: string): Promise<void> => {
    try {
      const serverInfo = await window.api.getServerInfo()
      if (serverInfo?.port) {
        const response = await fetch(`http://127.0.0.1:${serverInfo.port}/jobs/${jobId}/rerun`, {
          method: 'POST'
        })

        if (!response.ok) {
          const errorData = await response.json()
          toast.error(errorData.detail || 'Failed to rerun job')
          return
        }

        setActiveJobId(jobId)
        setShowJobProgress(true)
        fetchJobs()
        toast.success('Job rerun started successfully')
      }
    } catch (error) {
      console.error('Failed to rerun job:', error)
    }
  }

  const getStatusBadge = (state: Job['state']): React.JSX.Element => {
    const styles: Record<string, string> = {
      PENDING: 'bg-yellow-50 text-yellow-700 border-yellow-100 hover:bg-yellow-50',
      PROCESSING: 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-50',
      DONE: 'bg-green-50 text-green-700 border-green-100 hover:bg-green-50',
      FAILED: 'bg-red-50 text-red-700 border-red-100 hover:bg-red-50'
    }

    return (
      <Badge
        variant="outline"
        className={`capitalize font-medium ${styles[state] || 'bg-gray-50 text-gray-700 border-gray-100'}`}
      >
        {state.toLowerCase()}
      </Badge>
    )
  }
  console.log('Rendering Dashboard with jobs:', jobs)
  return (
    <TooltipProvider>
      <div className="flex-1 flex flex-col pb-12">
        {/* Header */}
        <div className="flex w-full items-center justify-between border-b p-4 bg-card">
          <h1 className="text-2xl font-bold">Job Dashboard</h1>
          <Button onClick={() => setShowUpload(true)}>Upload</Button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex justify-center p-4">
          <div className="w-full h-full rounded-lg border bg-card shadow-sm">
            <div className="h-full flex flex-col">
              <div className="p-4 flex items-center gap-4 border-b">
                <div className="flex-1">
                  <h2 className="text-lg font-semibold">Jobs</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLoading(true)
                    fetchJobs()
                  }}
                  className="flex items-center gap-1"
                >
                  <RefreshCcw />
                  Refresh
                </Button>
              </div>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead>Gate Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center">
                          <div className="flex items-center justify-center text-muted-foreground">
                            Loading jobs...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : jobs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="h-24 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <p>No jobs found</p>
                            <p className="text-sm">Upload content to start processing</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      jobs.map((job) => (
                        <TableRow key={job.job_id} className="group">
                          <TableCell className="font-medium">
                            <div className="flex flex-col gap-1">
                              <span className="font-mono text-sm">{job?.job_id}</span>
                              {(job.subject_name || job.standard_name || job.stream_name) && (
                                <span className="text-xs text-muted-foreground">
                                  {job.subject_name || job.standard_name || job.stream_name}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(job.state)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {job.format && (
                              <Badge
                                variant="outline"
                                className="capitalize bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-50"
                              >
                                {job.format.replace('-', ' ')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {
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
                            }
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{new Date(job.created_at).toLocaleDateString()}</span>
                              <span className="text-sm text-muted-foreground">
                                {new Date(job.created_at).toLocaleTimeString()}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2 transition-opacity">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => navigate(`/jobs/${job.job_id}`)}
                                      className="flex items-center gap-2"
                                      disabled={
                                        job.state === 'PROCESSING' ||
                                        job.state === 'PENDING' ||
                                        job.state === 'RUNNING'
                                      }
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>
                                      {job.state === 'PROCESSING' ||
                                      job.state === 'PENDING' ||
                                      job.state === 'RUNNING'
                                        ? 'Job is currently processing'
                                        : 'View job details and processing stages'}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              {serverPort && job.report_url && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          handleViewReport(
                                            job.gate_report_url.replace(
                                              /^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g,
                                              ''
                                            ),
                                            `Report for ${job.job_id}`
                                          )
                                        }
                                        className="flex items-center gap-2"
                                        disabled={
                                          job.state === 'PROCESSING' ||
                                          job.state === 'PENDING' ||
                                          job.state === 'RUNNING'
                                        }
                                      >
                                        <FileText className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>
                                        {job.state === 'PROCESSING' ||
                                        job.state === 'PENDING' ||
                                        job.state === 'RUNNING'
                                          ? 'Job is currently processing'
                                          : 'View report'}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRerun(job.job_id)}
                                      className="flex items-center gap-2"
                                      disabled={
                                        job.state === 'PROCESSING' ||
                                        job.state === 'PENDING' ||
                                        job.state === 'RUNNING'
                                      }
                                    >
                                      <RotateCw className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>
                                      {job.state === 'PROCESSING' ||
                                      job.state === 'PENDING' ||
                                      job.state === 'RUNNING'
                                        ? 'Job is currently processing'
                                        : 'Rerun job'}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setShowUpload(true)}
                                      className="flex items-center gap-2"
                                      disabled={
                                        job.state === 'PROCESSING' ||
                                        job.state === 'PENDING' ||
                                        job.state === 'RUNNING' ||
                                        !job.gate_passed
                                      }
                                    >
                                      <Upload className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>
                                      {job.state === 'PROCESSING' ||
                                      job.state === 'PENDING' ||
                                      job.state === 'RUNNING'
                                        ? 'Job is currently processing'
                                        : !job.gate_passed
                                          ? 'Upload is only available for jobs that passed the gate'
                                          : 'Upload new files'}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {!loading && jobs.length > 0 && (
                <div className="border-t px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * pageSize + 1} to{' '}
                      {Math.min(currentPage * pageSize, total)} of {total} entries
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                      >
                        {'Previous'}
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.ceil(total / pageSize) }, (_, i) => i + 1).map(
                          (page) => (
                            <Button
                              key={page}
                              variant={currentPage === page ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handlePageChange(page)}
                              className="h-8 w-8 p-0"
                            >
                              {page}
                            </Button>
                          )
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= Math.ceil(total / pageSize)}
                      >
                        {'Next'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <UploadForm
            open={showUpload}
            onClose={() => setShowUpload(false)}
            onSuccess={(jobId) => {
              setActiveJobId(jobId)
              setShowJobProgress(true)
              fetchJobs()
            }}
          />

          <JobProgress
            open={showJobProgress}
            onClose={() => {
              setShowJobProgress(false)
              setActiveJobId('')
              fetchJobs()
            }}
            jobId={activeJobId}
            serverPort={serverPort || 0}
          />

          <Dialog
            open={showReport}
            onOpenChange={(open) => {
              setShowReport(open)
              if (!open) {
                // Clean up the report content when dialog closes
                setReportContent('')
                // Add a small delay to ensure smooth transition
                setTimeout(() => {
                  document.body.style.pointerEvents = 'auto'
                }, 100)
              }
            }}
          >
            <DialogContent
              className="max-w-[95vw] w-full min-w-[1000px] h-[90vh] p-0"
              onInteractOutside={(e) => {
                e.preventDefault()
              }}
            >
              <DialogHeader className="px-6 py-4 border-b">
                <DialogTitle>{reportTitle}</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-auto p-6">
                <div
                  className="w-full h-full border-0 overflow-auto"
                  style={{ minHeight: '500px' }}
                  dangerouslySetInnerHTML={{ __html: reportContent }}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </TooltipProvider>
  )
}
