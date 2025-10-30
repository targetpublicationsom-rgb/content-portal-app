export interface DashboardStats {
  totals: {
    all: number
    queued: number
    running: number
    failed: number
    succeeded: number
    uploaded: number
  }
  today: {
    created: number
    succeeded: number
    failed: number
    uploaded: number
  }
  week: {
    created: number
    succeeded: number
    failed: number
    uploaded: number
  }
  by_stream: Array<{
    stream_id: number
    name: string
    count: number
  }>
}
