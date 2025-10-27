/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useEffect, useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Badge } from './ui/badge'
import { Clock, CheckCircle } from 'lucide-react'

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

    // Helper to update stage immutably and handle previous/future stages
    const updateStage = (
      stageName: string,
      status: Stage['status'],
      ts?: string,
      metrics?: Stage['metrics']
    ) => {
      setJobStatus((prev) => {
        if (!prev) return prev

        const stageIndex = prev.stages.findIndex((s) => s.name === stageName)
        let newStages: Stage[]

        if (stageIndex !== -1) {
          // Update all stages
          newStages = prev.stages.map((stage, index) => {
            if (stage.name === stageName) {
              return {
                ...stage,
                status,
                ...(ts
                  ? {
                      started_at: status === 'running' ? ts : stage.started_at,
                      ended_at: status !== 'running' ? ts : stage.ended_at
                    }
                  : {}),
                metrics: metrics || stage.metrics
              }
            } else if (index < stageIndex && stage.status !== 'ok' && stage.status !== 'error') {
              // Previous stages marked ok
              return { ...stage, status: 'ok', ended_at: stage.ended_at || ts }
            } else if (index > stageIndex && stage.status !== 'error') {
              // Future stages pending
              return { ...stage, status: 'pending' }
            }
            return stage
          })
        } else {
          // Stage doesn't exist yet, add it
          newStages = [
            ...prev.stages,
            {
              name: stageName,
              status,
              started_at: status === 'running' ? ts : undefined,
              ended_at: status !== 'running' ? ts : undefined,
              metrics
            }
          ]
        }

        return {
          ...prev,
          stages: newStages,
          state: status === 'error' ? 'FAILED' : 'PROCESSING'
        }
      })
    }

    // SSE listeners
    es.addEventListener('stage.started', (event: MessageEvent) => {
      const data = JSON.parse(event.data).data
      updateStage(data.stage, 'running', data.ts)
    })

    es.addEventListener('stage.succeeded', (event: MessageEvent) => {
      const data = JSON.parse(event.data).data
      updateStage(
        data.stage,
        'ok',
        data.ts,
        data.extra?.duration_sec ? { duration_sec: data.extra.duration_sec } : undefined
      )
    })

    es.addEventListener('stage.failed', (event: MessageEvent) => {
      const data = JSON.parse(event.data).data
      updateStage(data.stage, 'error', data.ts)
    })

    es.addEventListener('gate.updated', (event: MessageEvent) => {
      const data = JSON.parse(event.data).data
      setJobStatus((prev) =>
        prev
          ? { ...prev, gate_passed: data.passed, gate_report_url: data.extra?.report_html }
          : prev
      )
    })

    es.addEventListener('job.succeeded', () => {
      setJobStatus((prev) => {
        if (!prev) return prev
        const newStages = prev.stages.map((stage) =>
          stage.status === 'pending' || stage.status === 'running'
            ? { ...stage, status: 'ok', ended_at: new Date().toISOString() }
            : stage
        )
        return { ...prev, state: 'DONE', stages: newStages }
      })
    })

    es.addEventListener('job.failed', () => {
      setJobStatus((prev) => (prev ? { ...prev, state: 'FAILED' } : prev))
    })

    // Initial job fetch
    fetch(`http://127.0.0.1:${serverPort}/jobs/${jobId}`)
      .then((res) => res.json())
      .then((data: { stages: Stage[] } & Omit<JobStatus, 'stages'>) => {
        setJobStatus({
          ...data,
          stages: data.stages.map((stage) => ({
            ...stage,
            status:
              stage.status === 'ok'
                ? 'ok'
                : stage.status === 'error'
                  ? 'error'
                  : stage.started_at
                    ? 'running'
                    : 'pending'
          }))
        })
      })
      .catch(console.error)

    es.onerror = (err) => {
      console.warn('SSE error:', err, 'readyState:', es.readyState)
    }

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [open, jobId, serverPort])

  const getStatusBadge = (
    status: Stage['status'] | 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'
  ) => {
    const displayMap: Record<string, string> = {
      ok: 'DONE',
      error: 'FAILED',
      running: 'RUNNING',
      pending: 'PENDING',
      PROCESSING: 'PROCESSING',
      DONE: 'DONE',
      FAILED: 'FAILED'
    }

    const styles: Record<string, string> = {
      DONE: 'bg-green-50 text-green-700 border-green-100',
      FAILED: 'bg-red-50 text-red-700 border-red-100',
      RUNNING: 'bg-blue-50 text-blue-700 border-blue-100',
      PENDING: 'bg-gray-50 text-gray-700 border-gray-100',
      PROCESSING: 'bg-blue-50 text-blue-700 border-blue-100'
    }

    const displayStatus = displayMap[status] || status

    return (
      <Badge
        variant="outline"
        className={`capitalize flex items-center gap-2 ${styles[displayStatus]}`}
      >
        {status === 'running' && (
          <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        )}
        {displayStatus}
      </Badge>
    )
  }
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl"
        onInteractOutside={(e) => {
          e.preventDefault()
        }}
      >
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
                  <div className="text-right">{getStatusBadge(jobStatus.state)}</div>
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <div className="font-medium mb-4">Stages</div>
                <div className="space-y-0 relative ml-3">
                  {/* Timeline line */}
                  <div className="absolute left-0 top-4 bottom-4 border-l-2 border-border" />

                  {jobStatus.stages.map((stage) => {
                    return (
                      <div key={stage.name} className="relative pl-4 pb-1 last:pb-0">
                        {/* Timeline dot */}
                        <div
                          className={`absolute h-3 w-3 -translate-x-1/2 left-px top-[18px] rounded-full border-2 bg-background ${
                            stage.status === 'running'
                              ? 'border-blue-500'
                              : stage.status === 'ok'
                                ? 'border-green-500'
                                : stage.status === 'error'
                                  ? 'border-red-500'
                                  : 'border-gray-300'
                          }`}
                        />

                        {/* Content */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2.5">
                            <div>
                              <div className="font-medium">{stage.name}</div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                                <span>{getStatusBadge(stage.status)}</span>
                                {stage.metrics ? (
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span>Duration: {stage.metrics.duration_sec.toFixed(1)}s</span>
                                  </div>
                                ) : (
                                  stage?.started_at && (
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-3.5 w-3.5" />
                                      <span>Duration: {stage?.started_at}s</span>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1 pl-11">
                            {stage.ended_at && (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-3.5 w-3.5" />
                                <span>
                                  Completed {new Date(stage.ended_at).toLocaleTimeString()}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
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
