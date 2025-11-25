import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import { FileText, Eye, RefreshCw } from 'lucide-react'
import { qcService } from '../../services/qc.service'
import type { QCRecord, QCStatus } from '../../types/qc.types'

export default function QCFileList(): React.JSX.Element {
  const location = useLocation()
  const [records, setRecords] = useState<QCRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const navItems = [
    { path: '/qc', label: 'Dashboard' },
    { path: '/qc/files', label: 'Files' }
  ]

  useEffect(() => {
    loadRecords()

    const unsubscribeStatus = qcService.onStatusUpdate((data) => {
      setRecords((prev) =>
        prev.map((r) => (r.qc_id === data.qcId ? { ...r, status: data.status } : r))
      )
    })

    const unsubscribeFileDetected = qcService.onFileDetected((data) => {
      if (data.record) {
        setRecords((prev) => [data.record, ...prev])
      }
    })

    return () => {
      unsubscribeStatus()
      unsubscribeFileDetected()
    }
  }, [])

  const loadRecords = async (): Promise<void> => {
    try {
      setLoading(true)
      const data = await qcService.getRecords(undefined, 50, 0)
      setRecords(data)
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
      CONVERTING: { className: 'bg-blue-500', label: 'Converting' },
      SUBMITTING: { className: 'bg-indigo-500', label: 'Submitting' },
      PROCESSING: { className: 'bg-yellow-500', label: 'Processing' },
      DOWNLOADING: { className: 'bg-purple-500', label: 'Downloading' },
      CONVERTING_REPORT: { className: 'bg-cyan-500', label: 'Converting Report' },
      COMPLETED: { className: 'bg-green-500', label: 'Completed' },
      FAILED: { className: 'bg-red-500', label: 'Failed' }
    }

    const variant = variants[status]
    return (
      <Badge variant="default" className={variant.className}>
        {variant.label}
      </Badge>
    )
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  const openReport = async (record: QCRecord): Promise<void> => {
    if (record.report_docx_path) {
      await window.api.shell.openPath(record.report_docx_path)
    } else if (record.report_md_path) {
      await window.api.shell.openPath(record.report_md_path)
    }
  }

  const openFile = async (filePath: string): Promise<void> => {
    await window.api.shell.openPath(filePath)
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
          <p className="text-muted-foreground mt-1">View all quality check records</p>
        </div>
        <Button onClick={loadRecords} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent QC Files</CardTitle>
          <CardDescription>Last 50 quality check records</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filename</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead>Processed By</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No QC records found
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record.qc_id}>
                    <TableCell className="font-medium">{record.original_name}</TableCell>
                    <TableCell>{getStatusBadge(record.status)}</TableCell>
                    <TableCell>
                      {record.qc_score !== null ? (
                        <span
                          className={
                            record.qc_score >= 80
                              ? 'text-green-600 font-semibold'
                              : record.qc_score >= 60
                                ? 'text-yellow-600 font-semibold'
                                : 'text-red-600 font-semibold'
                          }
                        >
                          {record.qc_score}/100
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {record.issues_found !== null ? record.issues_found : '—'}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {record.processed_by || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(record.submitted_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openFile(record.file_path)}
                          title="Open original file"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        {(record.report_docx_path || record.report_md_path) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openReport(record)}
                            title="Open QC report"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
