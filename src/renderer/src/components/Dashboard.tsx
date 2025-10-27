import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import api from '../lib/axios'
import { useNavigate } from 'react-router-dom'
import UploadForm from './UploadForm'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import JobProgress from './JobProgress'
import { Eye, FileText, RefreshCcw, RotateCw, Upload, X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import toast from 'react-hot-toast'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface JobCounts {
  questions: number
  answers: number
  unmatched: number
}

interface Job {
  job_id: string
  mode: 'single' | 'two-file'
  state: 'DONE' | 'FAILED' | 'RUNNING'
  gate_passed: boolean
  created_at: string
  updated_at: string
  report_url: string | null
  stream_id: number | null
  stream_name: string | null
  standard_id: number | null
  standard_name: string | null
  subject_id: number | null
  subject_name: string | null
  upload_state: 'READY' | 'BLOCKED'
  upload_receipt_url: string | null
  counts: JobCounts
}

interface JobsResponse {
  items: Job[]
  next_cursor: string | null
  limit: number
}

export default function Dashboard(): React.JSX.Element {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [serverPort, setServerPort] = useState<number>()
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(8)
  const [total, setTotal] = useState(0)
  const [showReport, setShowReport] = useState(false)
  const [reportContent, setReportContent] = useState<string>('')
  const [reportTitle, setReportTitle] = useState('')
  const [showJobProgress, setShowJobProgress] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string>('')

  // Filter options state
  const [streams, setStreams] = useState<{ id: string; name: string }[]>([])
  const [standards, setStandards] = useState<{ id: string; name: string }[]>([])
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([])
  const [loadingOptions, setLoadingOptions] = useState({
    streams: false,
    standards: false,
    subjects: false
  })
  const [filters, setFilters] = useState({
    state: '',
    mode: '',
    stream_id: '',
    standard_id: '',
    subject_id: '',
    searchQuery: ''
  })

  // We're using the imported api instance from axios

  // Fetch filter options
  useEffect(() => {
    const fetchOptions = async (): Promise<void> => {
      try {
        setLoadingOptions((prev) => ({ ...prev, streams: true }))
        const { data: streamsData } = await api.get('/streams')
        setStreams(streamsData.data || [])
      } catch (error) {
        console.error('Failed to fetch streams:', error)
      } finally {
        setLoadingOptions((prev) => ({ ...prev, streams: false }))
      }
    }

    fetchOptions()
  }, []) // Fetch streams on mount

  // Watch stream_id for standards
  useEffect(() => {
    const fetchStandards = async (): Promise<void> => {
      if (filters.stream_id && filters.stream_id !== 'all') {
        try {
          setLoadingOptions((prev) => ({ ...prev, standards: true }))
          const { data: standardsData } = await api.get('/standards', {
            params: {
              stream_id: filters.stream_id
            }
          })
          setStandards(standardsData.data || [])
        } catch (error) {
          console.error('Failed to fetch standards:', error)
        } finally {
          setLoadingOptions((prev) => ({ ...prev, standards: false }))
        }
      } else {
        setStandards([])
        setFilters((prev) => ({ ...prev, standard_id: 'all', subject_id: 'all' }))
      }
    }

    fetchStandards()
  }, [filters.stream_id])

  // Watch standard_id for subjects
  useEffect(() => {
    const fetchSubjects = async (): Promise<void> => {
      if (filters.standard_id && filters.standard_id !== 'all') {
        try {
          setLoadingOptions((prev) => ({ ...prev, subjects: true }))
          const { data: subjectsData } = await api.get('/subjects', {
            params: {
              standard_metadata_id: filters.standard_id
            }
          })
          setSubjects(subjectsData.data || [])
        } catch (error) {
          console.error('Failed to fetch subjects:', error)
        } finally {
          setLoadingOptions((prev) => ({ ...prev, subjects: false }))
        }
      } else {
        setSubjects([])
        setFilters((prev) => ({ ...prev, subject_id: 'all' }))
      }
    }

    fetchSubjects()
  }, [filters.standard_id])

  // Initialize jobs
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
  }, [currentPage, filters]) // Refetch when page or filters change

  const fetchJobs = async (): Promise<void> => {
    try {
      const serverInfo = await window.api.getServerInfo()
      if (serverInfo?.port) {
        const params = new URLSearchParams({
          limit: pageSize.toString()
        })

        if (filters.state && filters.state !== 'all') params.append('state', filters.state)
        if (filters.mode && filters.mode !== 'all') params.append('mode', filters.mode)
        if (filters.stream_id && filters.stream_id !== 'all')
          params.append('stream_id', filters.stream_id)
        if (filters.standard_id && filters.standard_id !== 'all')
          params.append('standard_id', filters.standard_id)
        if (filters.subject_id && filters.subject_id !== 'all')
          params.append('subject_id', filters.subject_id)
        if (filters.searchQuery) params.append('q', filters.searchQuery)

        const response = await fetch(
          `http://127.0.0.1:${serverInfo.port}/dashboard/jobs?${params.toString()}`
        )
        if (response.ok) {
          const data: JobsResponse = await response.json()
          setJobs(data.items || [])
          setTotal(data.items.length)
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
              <div className="p-4 space-y-4 border-b">
                <div className="flex items-center gap-4">
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

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search jobs..."
                      value={filters.searchQuery}
                      onChange={(e) => {
                        setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))
                        setCurrentPage(1)
                      }}
                      className="w-full"
                    />
                    {filters.searchQuery && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setFilters((prev) => ({ ...prev, searchQuery: '' }))
                          setCurrentPage(1)
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <Select
                    value={filters.state}
                    onValueChange={(value) => {
                      setFilters((prev) => ({ ...prev, state: value }))
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      <SelectItem value="RUNNING">Running</SelectItem>
                      <SelectItem value="DONE">Done</SelectItem>
                      <SelectItem value="FAILED">Failed</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={filters.mode}
                    onValueChange={(value) => {
                      setFilters((prev) => ({ ...prev, mode: value }))
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Formats</SelectItem>

                      <SelectItem value="single">Single File</SelectItem>
                      <SelectItem value="two-file">Two Files</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={filters.stream_id}
                    onValueChange={(value) => {
                      setFilters((prev) => ({ ...prev, stream_id: value }))
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingOptions.streams ? 'Loading...' : 'Stream'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Streams</SelectItem>
                      {streams.map((stream) => (
                        <SelectItem key={stream.id} value={stream.id}>
                          {stream.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={filters.standard_id}
                    onValueChange={(value) => {
                      setFilters((prev) => ({ ...prev, standard_id: value }))
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={loadingOptions.standards ? 'Loading...' : 'Standard'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Standards</SelectItem>
                      {standards.map((standard) => (
                        <SelectItem key={standard.id} value={standard.id}>
                          {standard.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={filters.subject_id}
                    onValueChange={(value) => {
                      setFilters((prev) => ({ ...prev, subject_id: value }))
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={loadingOptions.subjects ? 'Loading...' : 'Subject'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Subjects</SelectItem>
                      {subjects.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                        <TableCell colSpan={12} className="h-24 text-center">
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
                            <Badge
                              variant="outline"
                              className="capitalize bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-50"
                            >
                              {job.mode?.replace('-', ' ')}
                            </Badge>
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
                                      disabled={job.state === 'RUNNING'}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>
                                      {job.state === 'RUNNING'
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
                                            job.report_url?.replace(
                                              /^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g,
                                              ''
                                            ) || '',
                                            `Report for ${job.job_id}`
                                          )
                                        }
                                        className="flex items-center gap-2"
                                        disabled={job.state === 'RUNNING'}
                                      >
                                        <FileText className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>
                                        {job.state === 'RUNNING'
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
                                      disabled={job.state === 'RUNNING'}
                                    >
                                      <RotateCw className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>
                                      {job.state === 'RUNNING'
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
                                      disabled={job.upload_state === 'BLOCKED'}
                                    >
                                      <Upload className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>
                                      {job.state === 'RUNNING'
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
