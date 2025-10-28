import api from '../lib/axios'
import type { TaxonomyOption } from '../types'

interface TaxonomyResponse {
  data: TaxonomyOption[]
}

/**
 * Fetch all streams
 */
export const fetchStreams = async (): Promise<TaxonomyOption[]> => {
  const { data } = await api.get<TaxonomyResponse>('/streams')
  return data.data || []
}

/**
 * Fetch all boards
 */
export const fetchBoards = async (): Promise<TaxonomyOption[]> => {
  const { data } = await api.get<TaxonomyResponse>('/boards')
  return data.data || []
}

/**
 * Fetch all mediums
 */
export const fetchMediums = async (): Promise<TaxonomyOption[]> => {
  const { data } = await api.get<TaxonomyResponse>('/mediums')
  return data.data || []
}

/**
 * Fetch standards based on stream, board, and medium
 * Requires all three parameters to be provided
 */
export const fetchStandards = async (
  streamId: string,
  boardId: string,
  mediumId: string
): Promise<TaxonomyOption[]> => {
  if (!streamId || !boardId || !mediumId) {
    return []
  }

  const { data } = await api.get<TaxonomyResponse>('/standards', {
    params: {
      stream_id: streamId,
      medium_id: mediumId,
      board_id: boardId
    }
  })
  return data.data || []
}

/**
 * Fetch subjects based on standard
 * Requires standard ID to be provided
 */
export const fetchSubjects = async (standardId: string): Promise<TaxonomyOption[]> => {
  if (!standardId) {
    return []
  }

  const { data } = await api.get<TaxonomyResponse>('/subjects', {
    params: {
      standard_metadata_id: standardId
    }
  })
  return data.data || []
}
