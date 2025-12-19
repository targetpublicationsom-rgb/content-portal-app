import type {
    NumberingValidationResult,
    NumberingValidationResponse,
    SingleFileValidationResult,
    SingleFileValidationResponse
} from '../types/numbering.types'

export const numberingService = {
    /**
     * Validate numbering in two separate files (questions and solutions)
     */
    async validateNumbering(
        questionsPath: string,
        solutionsPath: string,
        expectedCount?: number
    ): Promise<NumberingValidationResult> {
        const response = (await window.api.numbering.validate(
            questionsPath,
            solutionsPath,
            expectedCount
        )) as NumberingValidationResponse

        if (!response.success) {
            throw new Error(response.error || 'Validation failed')
        }

        if (!response.data) {
            throw new Error('No validation data returned')
        }

        return response.data
    },

    /**
     * Validate numbering in a single file with delimiter-separated blocks
     */
    async validateSingleFile(
        filePath: string,
        expectedCount?: number
    ): Promise<SingleFileValidationResult> {
        console.log('[numberingService] Calling validateSingleFile:', {
            filePath,
            expectedCount
        })
        const response = (await window.api.numbering.validateSingleFile(
            filePath,
            expectedCount
        )) as SingleFileValidationResponse

        console.log('[numberingService] Response received:', response)

        // If there's an actual error (not just validation failure), throw it
        if (response.error) {
            console.log('[numberingService] Error response:', response.error)
            throw new Error(response.error)
        }

        if (!response.data) {
            console.log('[numberingService] No data in response')
            throw new Error('No validation data returned')
        }

        console.log('[numberingService] Returning data:', response.data)
        return response.data
    }
}
