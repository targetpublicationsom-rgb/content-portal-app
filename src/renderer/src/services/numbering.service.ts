import type { NumberingValidationResult, NumberingValidationResponse } from '../types/numbering.types'

export const numberingService = {
    async validateNumbering(
        questionsPath: string,
        solutionsPath: string,
        expectedCount: number = 444
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
    }
}
