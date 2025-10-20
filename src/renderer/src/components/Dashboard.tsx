import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

interface Job {
  id: string
  name: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
}

export default function Dashboard(): React.JSX.Element {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchJobs()
  }, [])

  const fetchJobs = async (): Promise<void> => {
    try {
      const serverInfo = await window.api.getServerInfo()
      if (serverInfo?.port) {
        const response = await fetch(`http://127.0.0.1:${serverInfo.port}/jobs`)
        if (response.ok) {
          const data = await response.json()
          setJobs(data.jobs || [])
        }
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = (): void => {
    // TODO: Implement file upload
    console.log('Upload clicked')
  }

  const getStatusBadge = (status: string): React.JSX.Element => {
    const variants: Record<string, 'default' | 'success' | 'warning' | 'info' | 'destructive'> = {
      pending: 'warning',
      processing: 'info',
      completed: 'success',
      failed: 'destructive'
    }

    return <Badge variant={variants[status] || 'default'}>{status}</Badge>
  }

  return (
    <div className="flex-1 flex flex-col pb-12">
      {/* Header */}
      <div className="flex w-full items-center justify-between border-b p-4 bg-card">
        <h1 className="text-2xl font-bold">Job Dashboard</h1>
        <Button onClick={handleUpload}>Upload</Button>
      </div>

      {/* Main Content - centered 80% */}
      <div className="flex-1 flex justify-center overflow-auto p-4">
        <div className="w-4/5 h-full rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">
                    Loading jobs...
                  </TableCell>
                </TableRow>
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No jobs found
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.name}</TableCell>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell>{new Date(job.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
