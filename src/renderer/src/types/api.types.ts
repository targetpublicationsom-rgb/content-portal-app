export interface ApiResponse<T> {
  data: T
  status?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  next_cursor: string | null
  limit: number
  total?: number
}
