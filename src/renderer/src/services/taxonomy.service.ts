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
  boardId: string | undefined,
  mediumId: string
): Promise<TaxonomyOption[]> => {
  // Require stream and medium. Board is optional — when omitted, fetch standards
  // across all boards for the given stream+medium.
  if (!streamId || !mediumId) {
    return []
  }

  const params: Record<string, string> = {
    stream_id: streamId,
    medium_id: mediumId
  }

  if (boardId && boardId !== 'all') {
    params.board_id = boardId
  }

  const { data } = await api.get<TaxonomyResponse>('/standards', { params })
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


/**
 * Fetch editions based on standard
 * Requires standard ID to be provided
 */
export const fetchEditions = async (subjectId: string): Promise<TaxonomyOption[]> => {
  if (!subjectId) {
    return []
  }

  const { data } = await api.get<TaxonomyResponse>('/editions', {
    params: {
      subject_id: subjectId
    }
  })
  console.log(data)
  return data.data || []
}