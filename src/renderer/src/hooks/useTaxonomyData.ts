import { useState, useEffect, useCallback } from 'react'
import type { TaxonomyOption, LoadingOptions } from '../types'
import {
  fetchStreams,
  fetchBoards,
  fetchMediums,
  fetchStandards,
  fetchSubjects
} from '../services/taxonomy.service'

/**
 * Custom hook to manage taxonomy filter data and loading states
 * Handles fetching of streams, boards, mediums on mount
 * Standards require stream, board, and medium to be selected
 * Subjects require standard to be selected
 */
export const useTaxonomyData = (): {
  streams: TaxonomyOption[]
  boards: TaxonomyOption[]
  mediums: TaxonomyOption[]
  standards: TaxonomyOption[]
  subjects: TaxonomyOption[]
  loadingOptions: LoadingOptions
  loadStandards: (streamId: string, boardId: string, mediumId: string) => Promise<void>
  loadSubjects: (standardId: string) => Promise<void>
} => {
  const [streams, setStreams] = useState<TaxonomyOption[]>([])
  const [boards, setBoards] = useState<TaxonomyOption[]>([])
  const [mediums, setMediums] = useState<TaxonomyOption[]>([])
  const [standards, setStandards] = useState<TaxonomyOption[]>([])
  const [subjects, setSubjects] = useState<TaxonomyOption[]>([])

  const [loadingOptions, setLoadingOptions] = useState<LoadingOptions>({
    streams: false,
    boards: false,
    mediums: false,
    standards: false,
    subjects: false
  })

  // Fetch initial taxonomy data (streams, boards, mediums) on mount
  useEffect(() => {
    const fetchInitialData = async (): Promise<void> => {
      // Fetch streams
      try {
        setLoadingOptions((prev) => ({ ...prev, streams: true }))
        const streamsData = await fetchStreams()
        setStreams(streamsData)
      } catch {
        // Handle fetch error silently
      } finally {
        setLoadingOptions((prev) => ({ ...prev, streams: false }))
      }

      // Fetch boards
      try {
        setLoadingOptions((prev) => ({ ...prev, boards: true }))
        const boardsData = await fetchBoards()
        setBoards(boardsData)
      } catch {
        // Handle fetch error silently
      } finally {
        setLoadingOptions((prev) => ({ ...prev, boards: false }))
      }

      // Fetch mediums
      try {
        setLoadingOptions((prev) => ({ ...prev, mediums: true }))
        const mediumsData = await fetchMediums()
        setMediums(mediumsData)
      } catch {
        // Handle fetch error silently
      } finally {
        setLoadingOptions((prev) => ({ ...prev, mediums: false }))
      }
    }

    fetchInitialData()
  }, [])

  /**
   * Fetch standards based on selected stream, board, and medium
   */
  const loadStandards = useCallback(
    async (streamId: string, boardId: string, mediumId: string): Promise<void> => {
      if (
        !streamId ||
        streamId === 'all' ||
        !boardId ||
        boardId === 'all' ||
        !mediumId ||
        mediumId === 'all'
      ) {
        setStandards([])
        return
      }

      try {
        setLoadingOptions((prev) => ({ ...prev, standards: true }))
        const standardsData = await fetchStandards(streamId, boardId, mediumId)
        setStandards(standardsData)
      } catch {
        // Handle fetch error silently
        setStandards([])
      } finally {
        setLoadingOptions((prev) => ({ ...prev, standards: false }))
      }
    },
    []
  )

  /**
   * Fetch subjects based on selected standard
   */
  const loadSubjects = useCallback(async (standardId: string): Promise<void> => {
    if (!standardId || standardId === 'all') {
      setSubjects([])
      return
    }

    try {
      setLoadingOptions((prev) => ({ ...prev, subjects: true }))
      const subjectsData = await fetchSubjects(standardId)
      setSubjects(subjectsData)
    } catch {
      // Handle fetch error silently
      setSubjects([])
    } finally {
      setLoadingOptions((prev) => ({ ...prev, subjects: false }))
    }
  }, [])

  return {
    streams,
    boards,
    mediums,
    standards,
    subjects,
    loadingOptions,
    loadStandards,
    loadSubjects
  }
}
