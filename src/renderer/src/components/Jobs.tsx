import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { useNavigate } from 'react-router-dom'
import UploadForm from './UploadForm'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import JobProgress from './JobProgress'
import {
  Eye,
  FileText,
  RefreshCcw,
  RotateCw,
  Upload,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import toast from 'react-hot-toast'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import type { Job, JobsResponse, TaxonomyFilters } from '../types'
import { useTaxonomyData } from '../hooks'
import { DEFAULT_PAGE_SIZE } from '../constants'
import { uploadFilesToServer } from '../services'

export default function Jobs(): React.JSX.Element {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [serverPort, setServerPort] = useState<number>()
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(DEFAULT_PAGE_SIZE)
  const [total, setTotal] = useState(0)
  const [showReport, setShowReport] = useState(false)
  const [reportContent, setReportContent] = useState<string>('')
  const [reportTitle, setReportTitle] = useState('')
  const [showJobProgress, setShowJobProgress] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)
  const [uploadingJobs, setUploadingJobs] = useState<Set<string>>(new Set())
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadingJobId, setUploadingJobId] = useState<string>('')

  // Use the custom hook for taxonomy data
  const {
    streams,
    boards,
    mediums,
    standards,
    subjects,
    loadingOptions,
    loadStandards,
    loadSubjects
  } = useTaxonomyData()

  const [filters, setFilters] = useState<TaxonomyFilters>({
    state: '',
    mode: '',
    stream_id: '',
    board_id: '',
    medium_id: '',
    standard_id: '',
    subject_id: '',
    searchQuery: ''
  })

  // Watch stream_id, board_id, and medium_id for standards
  useEffect(() => {
    if (
      filters.stream_id &&
      filters.stream_id !== 'all' &&
      filters.medium_id &&
      filters.medium_id !== 'all' &&
      filters.board_id &&
      filters.board_id !== 'all'
    ) {
      loadStandards(filters.stream_id, filters.board_id, filters.medium_id)
    }
  }, [filters.stream_id, filters.board_id, filters.medium_id, loadStandards])

  // Watch standard_id for subjects
  useEffect(() => {
    if (filters.standard_id && filters.standard_id !== 'all') {
      loadSubjects(filters.standard_id)
    }
  }, [filters.standard_id, loadSubjects])

  // Initialize jobs
  useEffect(() => {
    const init = async (): Promise<void> => {
      const serverInfo = await window.api.getServerInfo()
      if (serverInfo?.port) {
        setServerPort(serverInfo.port)
        fetchJobsData()
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, filters]) // Refetch when page or filters change

  const fetchJobsData = async (): Promise<void> => {
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
        if (filters.board_id && filters.board_id !== 'all')
          params.append('board_id', filters.board_id)
        if (filters.medium_id && filters.medium_id !== 'all')
          params.append('medium_id', filters.medium_id)
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
        fetchJobsData()
        toast.success('Job rerun started successfully')
      }
    } catch (error) {
      console.error('Failed to rerun job:', error)
    }
  }

  const handleUploadToJob = async (jobId: string): Promise<void> => {
    try {
      // Show upload modal and set the current job ID
      setUploadingJobId(jobId)
      setShowUploadModal(true)

      // Add job to uploading set
      setUploadingJobs((prev) => new Set(prev).add(jobId))

      const result = await uploadFilesToServer(jobId)
      toast.success(result.message || 'Files uploaded successfully!')

      // Refresh jobs data to get updated status
      fetchJobsData()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      toast.error(errorMessage)
    } finally {
      // Remove job from uploading set and hide modal
      setUploadingJobs((prev) => {
        const newSet = new Set(prev)
        newSet.delete(jobId)
        return newSet
      })
      setShowUploadModal(false)
      setUploadingJobId('')
    }
  }

  const getStatusBadge = (state: Job['state']): React.JSX.Element => {
    const styles: Record<string, string> = {
      PENDING: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
      PROCESSING: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
      DONE: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
      FAILED: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
      RUNNING: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
      UPLOADED: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
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
  return (
    <TooltipProvider>
      <div className="flex-1 flex flex-col min-h-screen bg-gradient-to-br from-background via-background to-muted/20 overflow-auto custom-scrollbar">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="flex items-center justify-between px-8 py-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                Job Dashboard
              </h1>
              <p className="text-md text-muted-foreground">
                Manage and monitor your content processing jobs
              </p>
            </div>
            <Button
              onClick={() => setShowUpload(true)}
              className="px-6 py-3 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors shadow-sm"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-8 space-y-8 max-w-7xl mx-auto w-full">
          {/* Filters Section */}
          <div className="bg-card rounded-xl border shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-foreground">Jobs</h2>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilters({
                      state: '',
                      mode: '',
                      stream_id: '',
                      board_id: '',
                      medium_id: '',
                      standard_id: '',
                      subject_id: '',
                      searchQuery: ''
                    })
                    setCurrentPage(1)
                  }}
                  className="px-4 py-2 text-sm font-medium border-2 hover:bg-muted/50 rounded-lg transition-colors"
                >
                  Clear Filters
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLoading(true)
                    fetchJobsData()
                  }}
                  className="px-4 py-2 text-sm font-medium border-2 hover:bg-muted/50 rounded-lg transition-colors"
                >
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className="px-4 py-2 text-sm font-medium hover:bg-muted/50 rounded-lg transition-colors"
                >
                  {showFilters ? (
                    <>
                      Hide Filters <ChevronUp className="w-4 h-4 ml-1" />
                    </>
                  ) : (
                    <>
                      More Filters <ChevronDown className="w-4 h-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {/* Search Bar with State & Format */}
              <div className="flex gap-2">
                <Input
                  placeholder="Search jobs by ID, taxonomy..."
                  value={filters.searchQuery}
                  onChange={(e) => {
                    setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))
                    setCurrentPage(1)
                  }}
                  className="flex-1"
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
                <div className="w-40">
                  <Select
                    value={filters.state}
                    onValueChange={(value) => {
                      setFilters((prev) => ({ ...prev, state: value }))
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All States" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      <SelectItem value="RUNNING">Running</SelectItem>
                      <SelectItem value="DONE">Done</SelectItem>
                      <SelectItem value="FAILED">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40">
                  <Select
                    value={filters.mode}
                    onValueChange={(value) => {
                      setFilters((prev) => ({ ...prev, mode: value }))
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All Formats" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Formats</SelectItem>
                      <SelectItem value="single">Single File</SelectItem>
                      <SelectItem value="two-file">Two Files</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Collapsible Taxonomy Filters */}
              {showFilters && (
                <div className="space-y-2 pt-1">
                  {/* Row: Stream, Board, Medium */}
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <Select
                        value={filters.stream_id}
                        onValueChange={(value) => {
                          setFilters((prev) => ({
                            ...prev,
                            stream_id: value,
                            standard_id: '',
                            subject_id: ''
                          }))
                          setCurrentPage(1)
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={loadingOptions.streams ? 'Loading...' : 'All Streams'}
                          />
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
                    </div>
                    <div className="flex-1 min-w-0">
                      <Select
                        value={filters.board_id}
                        onValueChange={(value) => {
                          setFilters((prev) => ({
                            ...prev,
                            board_id: value,
                            standard_id: '',
                            subject_id: ''
                          }))
                          setCurrentPage(1)
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={loadingOptions.boards ? 'Loading...' : 'All Boards'}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Boards</SelectItem>
                          {boards.map((board) => (
                            <SelectItem key={board.id} value={board.id}>
                              {board.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 min-w-0">
                      <Select
                        value={filters.medium_id}
                        onValueChange={(value) => {
                          setFilters((prev) => ({
                            ...prev,
                            medium_id: value,
                            standard_id: '',
                            subject_id: ''
                          }))
                          setCurrentPage(1)
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={loadingOptions.mediums ? 'Loading...' : 'All Mediums'}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Mediums</SelectItem>
                          {mediums.map((medium) => (
                            <SelectItem key={medium.id} value={medium.id}>
                              {medium.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Row: Standard & Subject */}
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <Select
                        value={filters.standard_id}
                        onValueChange={(value) => {
                          setFilters((prev) => ({
                            ...prev,
                            standard_id: value,
                            subject_id: ''
                          }))
                          setCurrentPage(1)
                        }}
                        disabled={
                          loadingOptions.standards ||
                          !filters.stream_id ||
                          filters.stream_id === 'all' ||
                          !filters.medium_id ||
                          filters.medium_id === 'all' ||
                          !filters.board_id ||
                          filters.board_id === 'all'
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={loadingOptions.standards ? 'Loading...' : 'All Standards'}
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
                    </div>
                    <div className="flex-1 min-w-0">
                      <Select
                        value={filters.subject_id}
                        onValueChange={(value) => {
                          setFilters((prev) => ({ ...prev, subject_id: value }))
                          setCurrentPage(1)
                        }}
                        disabled={
                          loadingOptions.subjects ||
                          !filters.standard_id ||
                          filters.standard_id === 'all'
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={loadingOptions.subjects ? 'Loading...' : 'All Subjects'}
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
                </div>
              )}
            </div>
          </div>

          {/* Jobs Table Section */}
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden mb-5">
            <div className="overflow-auto custom-scrollbar">
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
                          <div className="flex items-center gap-2">{getStatusBadge(job.state)}</div>
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
                                    disabled={job.state !== 'FAILED'}
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
                                    onClick={() => handleUploadToJob(job.job_id)}
                                    className="flex items-center gap-2"
                                    disabled={
                                      job.upload_state !== 'READY' || uploadingJobs.has(job.job_id)
                                    }
                                  >
                                    {uploadingJobs.has(job.job_id) ? (
                                      <RotateCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Upload className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    {uploadingJobs.has(job.job_id)
                                      ? 'Uploading files...'
                                      : job.upload_state !== 'READY'
                                        ? job.upload_state === 'BLOCKED'
                                          ? 'Upload is blocked for this job'
                                          : job.upload_state === 'UPLOADED'
                                            ? 'Files have already been uploaded'
                                            : 'Upload not available'
                                        : 'Upload files to job'}
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
            fetchJobsData()
          }}
        />

        <JobProgress
          open={showJobProgress}
          onClose={() => {
            setShowJobProgress(false)
            setActiveJobId('')
            fetchJobsData()
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
            <div className="flex-1 overflow-auto p-3 custom-scrollbar">
              <div
                className="w-full h-full border-0 overflow-auto custom-scrollbar"
                style={{ minHeight: '500px' }}
                dangerouslySetInnerHTML={{ __html: reportContent }}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Upload Loading Modal */}
        <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
          <DialogContent className="sm:max-w-md" showCloseButton={false}>
            <DialogHeader className="text-center">
              <DialogTitle className="flex items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                Uploading Files
              </DialogTitle>
            </DialogHeader>
            <div className="py-6 text-center space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Uploading files for job Id :{' '}
                  <span className="font-mono font-medium">{uploadingJobId}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Please wait while we process your upload...
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
