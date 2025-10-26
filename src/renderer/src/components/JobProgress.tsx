/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useEffect, useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Badge } from './ui/badge'

interface Stage {
  name: string
  status: 'ok' | 'error' | 'running' | 'pending'
  started_at?: string
  ended_at?: string
  metrics?: {
    duration_sec: number
  }
  log_path?: string
}

interface JobStatus {
  job_id: string
  format: 'single' | 'two-file'
  state: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'
  gate_passed?: boolean
  gate_report_url?: string
  stages: Stage[]
  created_at: string
  updated_at: string
  workspace?: string
  report_url?: string
}

interface JobProgressProps {
  open: boolean
  onClose: () => void
  jobId: string
  serverPort: number
}

export default function JobProgress({ open, onClose, jobId, serverPort }: JobProgressProps) {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!open || !jobId || !serverPort) return

    const es = new EventSource(`http://127.0.0.1:${serverPort}/jobs/${jobId}/events`)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      if (!event.data) return // skip heartbeat
      try {
        const data = JSON.parse(event.data)
        console.log('Received event:', data)
        setJobStatus(data)

        if (data.state === 'DONE' || data.state === 'FAILED') {
          es.close()
        }
      } catch (err) {
        console.error('Failed to parse SSE data:', err)
      }
    }

    es.onerror = (err) => {
      console.warn('SSE error:', err, 'readyState:', es.readyState)
      // Do NOT close manually; let auto-reconnect handle it
    }

    return () => es.close()
  }, [open, jobId, serverPort])

  const getStatusBadge = (status: Stage['status'] | 'ok' | 'error' | 'running' | 'pending') => {
    const styles: Record<string, string> = {
      ok: 'bg-green-50 text-green-700 border-green-100',
      error: 'bg-red-50 text-red-700 border-red-100',
      running: 'bg-blue-50 text-blue-700 border-blue-100',
      pending: 'bg-gray-50 text-gray-700 border-gray-100'
    }

    return (
      <Badge variant="outline" className={`capitalize ${styles[status]}`}>
        {status}
      </Badge>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Job Progress</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {jobStatus ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Job ID</div>
                  <div className="font-mono text-sm text-muted-foreground">{jobStatus.job_id}</div>
                </div>
                <div>
                  <div className="font-medium">Status</div>
                  <div className="text-right">
                    {getStatusBadge(
                      jobStatus.state === 'DONE'
                        ? 'ok'
                        : jobStatus.state === 'FAILED'
                          ? 'error'
                          : jobStatus.state === 'PROCESSING'
                            ? 'running'
                            : 'pending'
                    )}
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <div className="font-medium">Stages</div>
                {jobStatus.stages.map((stage) => (
                  <div key={stage.name} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{stage.name}</div>
                      {stage.metrics && (
                        <div className="text-sm text-muted-foreground">
                          Duration: {stage.metrics.duration_sec.toFixed(1)}s
                        </div>
                      )}
                    </div>
                    <div>{getStatusBadge(stage.status)}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-4 text-muted-foreground">Connecting to job...</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
