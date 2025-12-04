import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import {
  Package,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  RotateCw
} from 'lucide-react'
import { qcService } from '../../services/qc.service'
import type { QCBatch, BatchStatus } from '../../types/qc.types'

const ITEMS_PER_PAGE = 10

interface RetryResult {
  batchId: string
  failedCount: number
}

export default function QCBatchList(): React.JSX.Element {
  const location = useLocation()
  const [batches, setBatches] = useState<QCBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showRetryModal, setShowRetryModal] = useState(false)
  const [retryResult, setRetryResult] = useState<RetryResult | null>(null)

  const navItems = [
    { path: '/qc', label: 'Dashboard' },
    { path: '/qc/files', label: 'Files' },
    { path: '/qc/batches', label: 'Batches' },
    { path: '/qc/settings', label: 'Settings' }
  ]

  useEffect(() => {
    loadBatches()

    // Poll every 5 seconds
    const interval = setInterval(() => {
      loadBatches()
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const loadBatches = async (): Promise<void> => {
    try {
      const data = await qcService.getBatches()
      setBatches(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load batches')
    } finally {
      setLoading(false)
    }
  }

  const getBatchStatusBadge = (status: BatchStatus): React.JSX.Element => {
    const statusConfig: Record<
      BatchStatus,
      { className: string; label: string; icon: React.ReactNode }
    > = {
      PENDING: {
        className: 'bg-gray-500',
        label: 'Pending',
        icon: <Clock className="h-3 w-3 mr-1" />
      },
      SUBMITTED: {
        className: 'bg-blue-500',
        label: 'Submitted',
        icon: <Package className="h-3 w-3 mr-1" />
      },
      PROCESSING: {
        className: 'bg-purple-500',
        label: 'Processing',
        icon: <Loader2 className="h-3 w-3 mr-1 animate-spin" />
      },
      PARTIAL_COMPLETE: {
        className: 'bg-yellow-600',
        label: 'Partial Complete',
        icon: <AlertCircle className="h-3 w-3 mr-1" />
      },
      COMPLETED: {
        className: 'bg-green-500',
        label: 'Completed',
        icon: <CheckCircle2 className="h-3 w-3 mr-1" />
      },
      FAILED: {
        className: 'bg-red-500',
        label: 'Failed',
        icon: <AlertCircle className="h-3 w-3 mr-1" />
      }
    }

    const config = statusConfig[status]
    return (
      <Badge variant="default" className={`${config.className} flex items-center w-fit`}>
        {config.icon}
        {config.label}
      </Badge>
    )
  }

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '—'
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  // Pagination logic
  const totalPages = Math.ceil(batches.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedBatches = batches.slice(startIndex, endIndex)
  const hasNextPage = currentPage < totalPages
  const hasPreviousPage = currentPage > 1

  const handleNextPage = (): void => {
    if (hasNextPage) {
      setCurrentPage(currentPage + 1)
    }
  }

  const handlePreviousPage = (): void => {
    if (hasPreviousPage) {
      setCurrentPage(currentPage - 1)
    }
  }

  const retryBatch = async (batchId: string, failedCount: number): Promise<void> => {
    try {
      setLoading(true)
      await qcService.retryBatch(batchId)
      setRetryResult({ batchId, failedCount })
      setShowRetryModal(true)
      await loadBatches()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry batch')
    } finally {
      setLoading(false)
    }
  }

  if (loading && batches.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="pb-[10%] pt-8 px-8 space-y-6">
      {/* Navigation Tabs */}
      <div className="flex items-center gap-4 border-b pb-4 overflow-x-auto">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
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
          <h1 className="text-3xl font-bold">Batch QC Processing</h1>
          <p className="text-muted-foreground mt-1">
            Monitor batch submissions and progress ({batches.length} batches)
          </p>
        </div>
        <Button onClick={loadBatches} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      )}

      {batches.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">No batches found</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Batches</CardTitle>
            <CardDescription>
              Showing {startIndex + 1} to {Math.min(endIndex, batches.length)} of {batches.length}{' '}
              batch{batches.length !== 1 ? 'es' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-md overflow-hidden max-h-[600px] flex flex-col">
              <div className="overflow-y-auto flex-1">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Batch ID</TableHead>
                      <TableHead>Files</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Results</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedBatches.map((batch) => (
                      <TableRow key={batch.batch_id}>
                        <TableCell className="font-mono text-xs">
                          {batch.batch_id.substring(0, 12)}...
                        </TableCell>
                        <TableCell>{batch.file_count}</TableCell>
                        <TableCell>{getBatchStatusBadge(batch.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(batch.created_at)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(batch.submitted_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-green-600 font-medium">
                              {batch.completed_count}
                            </span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-red-600 font-medium">{batch.failed_count}</span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-blue-600 font-medium">
                              {batch.processing_count}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {(batch.status === 'FAILED' || batch.status === 'PARTIAL_COMPLETE') &&
                            batch.failed_count > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => retryBatch(batch.batch_id, batch.failed_count)}
                                disabled={loading}
                                className="flex items-center gap-1"
                              >
                                {loading ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RotateCw className="h-3 w-3" />
                                )}
                                Retry Failed ({batch.failed_count})
                              </Button>
                            )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={!hasPreviousPage}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!hasNextPage}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics Summary */}
      {batches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{batches.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Files</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {batches.reduce((sum, b) => sum + b.file_count, 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {batches.reduce((sum, b) => sum + b.completed_count, 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {batches.reduce((sum, b) => sum + b.failed_count, 0)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Retry Success Modal */}
      <Dialog open={showRetryModal} onOpenChange={setShowRetryModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Batch Retry Successful
            </DialogTitle>
            <DialogDescription>
              The failed files have been re-queued for processing.
            </DialogDescription>
          </DialogHeader>
          {retryResult && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Batch ID</p>
                  <p className="font-mono text-xs mt-1">
                    {retryResult.batchId.substring(0, 12)}...
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Files Re-queued</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">{retryResult.failedCount}</p>
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-4">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>What happens next:</strong>
                </p>
                <ul className="mt-2 space-y-1 text-sm text-blue-800 dark:text-blue-200">
                  <li>• Failed files have been removed from the original batch</li>
                  <li>• Files are now queued individually for re-processing</li>
                  <li>• They will be grouped into new batches as they accumulate</li>
                  <li>• You can monitor progress in the Files tab</li>
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowRetryModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
