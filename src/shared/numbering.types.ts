// Type definitions for Content Numbering Checker
export interface NumberingValidationRequest {
    questionsPath: string
    solutionsPath: string
    expectedCount?: number
}

export interface NumberingValidationResult {
    status: 'passed' | 'failed'
    summary: {
        questions: {
            count: number
            expected: number
        }
        solutions: {
            count: number
            expected: number
        }
    }
    issues: string[]
    details: {
        questions: {
            count: number
            expected: number
            numbers: number
        }
        solutions: {
            count: number
            expected: number
            numbers: number
        }
    }
}

export interface NumberingValidationResponse {
    success: boolean
    data?: NumberingValidationResult
    error?: string
}
