// Type definitions for Content Numbering Checker

// ==================== TWO-FILE FORMAT (Existing) ====================

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

// ==================== SINGLE-FILE FORMAT (New) ====================

export interface SingleFileValidationRequest {
    filePath: string
    expectedCount?: number
}

export interface ContentBlock {
    count: number
    numbers: number[]
}

export interface SingleFileValidationResult {
    success: boolean
    blocks_found: number
    questions: ContentBlock
    solutions: ContentBlock
    issues: string[]
    expected_count: number | null
    error?: string
}

export interface SingleFileValidationResponse {
    success: boolean
    data?: SingleFileValidationResult
    error?: string
}
