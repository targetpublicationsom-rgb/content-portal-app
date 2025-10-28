export interface TaxonomyOption {
  id: string
  name: string
}

export interface TaxonomyFilters {
  state: string
  mode: string
  stream_id: string
  board_id: string
  medium_id: string
  standard_id: string
  subject_id: string
  searchQuery: string
}

export interface LoadingOptions {
  streams: boolean
  boards: boolean
  mediums: boolean
  standards: boolean
  subjects: boolean
}
