import { useEffect, useState, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card, CardContent } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import {
  FileText,
  RefreshCw,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Loader2
} from 'lucide-react'
import { qcService } from '../../services/qc.service'
import type { QCRecord, QCStatus, QCFilters } from '../../types/qc.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'
import katex from 'katex'

export default function QCFileList(): React.JSX.Element {
  const location = useLocation()
  const [records, setRecords] = useState<QCRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [convertingReports, setConvertingReports] = useState<Set<string>>(new Set())

  // Markdown modal state
  const [showMarkdownModal, setShowMarkdownModal] = useState(false)
  const [markdownContent, setMarkdownContent] = useState('')
  const [markdownTitle, setMarkdownTitle] = useState('')
  const [loadingMarkdown, setLoadingMarkdown] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)
  const [totalRecords, setTotalRecords] = useState(0)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<QCStatus | 'all'>('all')
  const [issueFilter, setIssueFilter] = useState<'all' | 'with-issues' | 'no-issues'>('all')

  const navItems = [
    { path: '/qc', label: 'Dashboard' },
    { path: '/qc/files', label: 'Files' },
    { path: '/qc/batches', label: 'Batches' },
    { path: '/qc/settings', label: 'Settings' }
  ]

  // Render markdown as HTML
  const renderedMarkdown = useMemo(() => {
    if (!markdownContent) return ''
    try {
      // Configure marked for better rendering
      marked.setOptions({
        breaks: true,
        gfm: true
      })

      // Preprocess LaTeX expressions to ensure they're properly formatted
      let processedContent = markdownContent
      
      // Replace inline LaTeX with HTML spans containing KaTeX-rendered content
      processedContent = processedContent.replace(/\$([^\$]+?)\$/g, (match, latex) => {
        try {
          const html = katex.renderToString(latex.trim(), {
            throwOnError: false,
            displayMode: false
          })
          return html
        } catch {
          return match
        }
      })
      
      // Replace display LaTeX ($$...$$) with KaTeX-rendered content
      processedContent = processedContent.replace(/\$\$([^\$]+?)\$\$/g, (match, latex) => {
        try {
          const html = katex.renderToString(latex.trim(), {
            throwOnError: false,
            displayMode: true
          })
          return html
        } catch {
          return match
        }
      })
      
      // Parse markdown to HTML - use marked.parse() which returns string synchronously for simple markdown
      const html = marked.parse(processedContent, { async: false }) as string
      
      return DOMPurify.sanitize(html, {
        ADD_TAGS: ['span', 'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'mtext', 'annotation', 'munderover', 'munder', 'mover'],
        ADD_ATTR: ['class', 'xmlns', 'encoding', 'display', 'style']
      })
    } catch (err) {
      console.error('[QCFileList] Error rendering markdown:', err)
      // Return escaped HTML as fallback
      return `<pre>${markdownContent}</pre>`
    }
  }, [markdownContent])

  useEffect(() => {
    loadRecords()

    // Poll database every 5 seconds for updates
    const pollInterval = setInterval(() => {
      loadRecords()
    }, 5000)

    return () => {
      clearInterval(pollInterval)
    }
  }, [currentPage, itemsPerPage, searchQuery, statusFilter, issueFilter])

  const loadRecords = async (): Promise<void> => {
    try {
      setLoading(true)

      // Build filters
      const filters: QCFilters = {}
      if (statusFilter !== 'all') {
        filters.status = statusFilter
      }
      if (searchQuery.trim()) {
        filters.filename = searchQuery.trim()
      }
      if (issueFilter === 'with-issues') {
        filters.hasIssues = true
      } else if (issueFilter === 'no-issues') {
        filters.hasIssues = false
      }

      const offset = (currentPage - 1) * itemsPerPage
      const data = await qcService.getRecords(filters, itemsPerPage, offset)
      setRecords(data)

      // Get total count for pagination (we'll need to add this to the service)
      const stats = await qcService.getStats()
      setTotalRecords(stats.total)

      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load records')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: QCStatus): React.JSX.Element => {
    const variants: Record<QCStatus, { className: string; label: string }> = {
      QUEUED: { className: 'bg-gray-500', label: 'Queued' },
      VALIDATING: { className: 'bg-cyan-500', label: 'Validating' },
      MERGING: { className: 'bg-teal-500', label: 'Merging Files' },
      CONVERTING: { className: 'bg-indigo-500', label: 'Converting' },
      CONVERTED: { className: 'bg-blue-400', label: 'Converted' },
      CONVERSION_FAILED: { className: 'bg-amber-600', label: 'Conversion Failed' },
      SUBMITTING: { className: 'bg-purple-500', label: 'Submitting' },
      PENDING_VERIFICATION: { className: 'bg-yellow-500', label: 'Verifying Batch' },
      PROCESSING: { className: 'bg-blue-500', label: 'Processing' },
      DOWNLOADING: { className: 'bg-orange-500', label: 'Downloading' },
      COMPLETED: { className: 'bg-green-500', label: 'Completed' },
      FAILED: { className: 'bg-red-500', label: 'Failed' },
      NUMBERING_FAILED: { className: 'bg-yellow-600', label: 'Numbering Failed' }
    }

    const variant = variants[status]
    return (
      <Badge variant="default" className={variant.className}>
        {variant.label}
      </Badge>
    )
  }

  const getFileTypeBadge = (
    fileType: 'theory' | 'mcqs-solution' | 'merged-mcqs-solution' | 'single-file' | null
  ): React.JSX.Element => {
    if (!fileType || fileType === 'single-file') {
      return <span className="text-muted-foreground text-xs">—</span>
    }

    const typeLabels = {
      theory: { label: 'Theory', className: 'bg-blue-100 text-blue-700 border-blue-200' },
      'mcqs-solution': {
        label: 'MCQs+Sol',
        className: 'bg-green-100 text-green-700 border-green-200'
      },
      'merged-mcqs-solution': {
        label: 'MCQs+Sol (Merged)',
        className: 'bg-purple-100 text-purple-700 border-purple-200'
      }
    }

    const config = typeLabels[fileType]
    return (
      <Badge variant="outline" className={config.className}>
        {config.label}
      </Badge>
    )
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  const handleRetry = async (qcId: string) => {
    try {
      // Immediately update the UI to show QUEUED status
      setRecords((prev) =>
        prev.map((r) => (r.qc_id === qcId ? { ...r, status: 'QUEUED' as QCStatus } : r))
      )

      // Call retry in background
      await qcService.retryRecord(qcId)
    } catch (err) {
      console.error('Failed to retry record:', err)
      setError('Failed to retry record')
      // Reload on error to get correct status
      loadRecords()
    }
  }

  const viewMarkdownReport = async (record: QCRecord) => {
    if (!record.report_md_path) return

    setLoadingMarkdown(true)
    setShowMarkdownModal(true)
    setMarkdownTitle(record.original_name)

    try {
      const content = await window.api.readHtmlFile(record.report_md_path)
      setMarkdownContent(content)
    } catch (err) {
      setMarkdownContent(
        'Error loading markdown file: ' + (err instanceof Error ? err.message : 'Unknown error')
      )
    } finally {
      setLoadingMarkdown(false)
    }
  }

  const handleConvertAndDownloadDocx = async (record: QCRecord) => {
    if (!record.report_md_path) return

    setConvertingReports((prev) => new Set(prev).add(record.qc_id))

    try {
      let docxPath = record.report_docx_path

      // Convert if DOCX doesn't exist
      if (!docxPath) {
        const result = await window.api.qc.convertReportToDocx(record.qc_id)

        if (!result.success) {
          setError(result.error || 'Failed to convert report')
          return
        }

        docxPath = result.data.docxPath

        // Update local state with DOCX path
        setRecords((prev) =>
          prev.map((r) => (r.qc_id === record.qc_id ? { ...r, report_docx_path: docxPath } : r))
        )
      }

      // Show save dialog
      const saveResult = await window.api.dialog.showSaveDialog({
        title: 'Save QC Report',
        defaultPath: `${record.original_name.replace(/\.[^/.]+$/, '')}_QC_Report.docx`,
        filters: [{ name: 'Word Documents', extensions: ['docx'] }]
      })

      if (!saveResult.canceled && saveResult.filePath && docxPath) {
        // Copy file to selected location
        const copyResult = await window.api.file.copy(docxPath, saveResult.filePath)

        if (!copyResult.success) {
          setError(copyResult.error || 'Failed to save file')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download report')
    } finally {
      setConvertingReports((prev) => {
        const next = new Set(prev)
        next.delete(record.qc_id)
        return next
      })
    }
  }

  const totalPages = Math.ceil(totalRecords / itemsPerPage)
  const canGoPrevious = currentPage > 1
  const canGoNext = currentPage < totalPages

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
    }
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setCurrentPage(1) // Reset to first page on search
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value as QCStatus | 'all')
    setCurrentPage(1) // Reset to first page on filter change
  }

  const handleIssueFilterChange = (value: string) => {
    setIssueFilter(value as 'all' | 'with-issues' | 'no-issues')
    setCurrentPage(1) // Reset to first page on filter change
  }

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(parseInt(value))
    setCurrentPage(1) // Reset to first page on page size change
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">QC Records</h1>
          <p className="text-muted-foreground mt-1">
            Showing {records.length} of {totalRecords} records
          </p>
        </div>
        <Button onClick={loadRecords} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters - Compact Layout */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search - Takes 50% */}
            <div className="flex-2 min-w-0">
              <Input
                placeholder="Search by filename..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Status Filter - 25% */}
            <div className="flex-1 min-w-0">
              <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="QUEUED">Queued</SelectItem>
                  <SelectItem value="CONVERTING">Converting</SelectItem>
                  <SelectItem value="SUBMITTING">Submitting</SelectItem>
                  <SelectItem value="PROCESSING">Processing</SelectItem>
                  <SelectItem value="DOWNLOADING">Downloading</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                  <SelectItem value="NUMBERING_FAILED">Numbering Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Issues Filter - 25% */}
            <div className="flex-1 min-w-0">
              <Select value={issueFilter} onValueChange={handleIssueFilterChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Records</SelectItem>
                  <SelectItem value="with-issues">With Issues</SelectItem>
                  <SelectItem value="no-issues">No Issues</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[25%]">Filename</TableHead>
                  <TableHead className="w-[15%] hidden xl:table-cell">Chapter</TableHead>
                  <TableHead className="w-[10%] hidden lg:table-cell">Type</TableHead>
                  <TableHead className="w-[13%]">Status</TableHead>
                  <TableHead className="w-[8%] text-center">Issues</TableHead>
                  <TableHead className="w-[12%] hidden lg:table-cell">Processed By</TableHead>
                  <TableHead className="w-[10%] hidden md:table-cell">Submitted</TableHead>
                  <TableHead className="w-[10%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No QC records found
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => (
                    <TableRow key={record.qc_id}>
                      <TableCell className="font-medium max-w-0">
                        <div className="truncate" title={record.original_name}>
                          {record.original_name}
                        </div>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell max-w-0">
                        <div className="truncate" title={record.chapter_name || undefined}>
                          {record.chapter_name || (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {getFileTypeBadge(record.file_type)}
                      </TableCell>
                      <TableCell>{getStatusBadge(record.status)}</TableCell>
                      <TableCell className="text-center">
                        {record.issues_found !== null ? (
                          <Badge
                            variant="outline"
                            className={
                              record.issues_found > 0
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-green-50 text-green-700 border-green-200'
                            }
                          >
                            {record.issues_found}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground hidden lg:table-cell max-w-0">
                        <div className="truncate" title={record.processed_by || undefined}>
                          {record.processed_by || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                        {formatDate(record.submitted_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {(record.status === 'CONVERSION_FAILED' ||
                            record.status === 'NUMBERING_FAILED') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleRetry(record.qc_id)}
                              title="Retry processing"
                            >
                              <RotateCw className="h-4 w-4" />
                            </Button>
                          )}
                          {record.report_md_path && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => viewMarkdownReport(record)}
                                title="View Report"
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleConvertAndDownloadDocx(record)}
                                disabled={convertingReports.has(record.qc_id)}
                                title="Download Report"
                              >
                                {convertingReports.has(record.qc_id) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <FileDown className="h-4 w-4" />
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-t bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                Rows per page:
              </span>
              <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                <SelectTrigger className="w-[70px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {totalRecords > 0
                  ? `${(currentPage - 1) * itemsPerPage + 1}-${Math.min(
                      currentPage * itemsPerPage,
                      totalRecords
                    )} of ${totalRecords}`
                  : '0 records'}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!canGoPrevious || loading}
                  title="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!canGoNext || loading}
                  title="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Markdown Viewer Modal */}
      <Dialog open={showMarkdownModal} onOpenChange={setShowMarkdownModal}>
        <DialogContent className="min-w-5xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>QC Report - {markdownTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {loadingMarkdown ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <span className="ml-2">Loading report...</span>
              </div>
            ) : (
              <div
                className="qc-markdown-content max-w-none p-4 bg-slate-50 dark:bg-slate-900 rounded-md text-sm"
                dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
