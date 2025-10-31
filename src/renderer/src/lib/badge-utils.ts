export const getJobStateBadgeStyles = (state: string): string => {
  const styles: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
    PROCESSING: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    DONE: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    FAILED: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
    RUNNING: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
    UPLOADED: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
  }
  
  return styles[state] || 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
}

export const getGateStatusBadgeStyles = (gatePassed: boolean): string => {
  return gatePassed
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-rose-50 text-rose-700 border-rose-200'
}

export const getStageStatusBadgeStyles = (status: string): string => {
  const styles: Record<string, string> = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    running: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200'
  }
  
  return styles[status] || 'bg-gray-50 text-gray-700 border-gray-200'
}