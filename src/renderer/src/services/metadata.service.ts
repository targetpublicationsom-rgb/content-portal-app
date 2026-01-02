// Metadata service for QC subjective files
// Uses existing taxonomy service for Standards and Subjects

import { fetchSubjects } from './taxonomy.service'
import api from '../lib/axios'
import type { TaxonomyOption } from '../types'

interface TaxonomyResponse {
    data: TaxonomyOption[]
}

// Re-export taxonomy types for metadata context
export type Standard = TaxonomyOption
export type Subject = TaxonomyOption
export type Chapter = TaxonomyOption

class MetadataService {
    /**
     * Fetch all standards (without requiring stream/board/medium)
     * For QC metadata, we fetch standards directly
     */
    async getStandards(): Promise<Standard[]> {
        try {
            // Fetch standards without filters
            const response = await api.get<TaxonomyResponse>('/standards')
            return response.data.data || []
        } catch (error) {
            console.error('[MetadataService] Error fetching standards:', error)
            throw error
        }
    }

    /**
     * Fetch subjects for a given standard
     * Uses existing taxonomy service
     */
    async getSubjects(standardId: string): Promise<Subject[]> {
        try {
            return await fetchSubjects(standardId)
        } catch (error) {
            console.error('[MetadataService] Error fetching subjects:', error)
            throw error
        }
    }

    /**
     * Fetch chapters for a given subject
     */
    async getChapters(subjectId: string): Promise<Chapter[]> {
        try {
            if (!subjectId) {
                return []
            }

            const response = await api.get<TaxonomyResponse>('/chapters', {
                params: {
                    subject_id: subjectId
                }
            })
            return response.data.data || []
        } catch (error) {
            console.error('[MetadataService] Error fetching chapters:', error)
            throw error
        }
    }
}

export const metadataService = new MetadataService()
