import { ipcMain } from 'electron'
import { validateNumbering } from './numberingChecker'
import { validateSingleFile } from './singleFileChecker'
import type { NumberingValidationResponse, SingleFileValidationResponse } from '../shared/numbering.types'

export function registerNumberingIpcHandlers(): void {
    // Two-file format validation handler
    ipcMain.handle(
        'numbering:validate',
        async (_event, questionsPath: string, solutionsPath: string, expectedCount?: number) => {
            try {
                console.log('[Numbering IPC] Validation request received')
                console.log('[Numbering IPC] Questions:', questionsPath)
                console.log('[Numbering IPC] Solutions:', solutionsPath)
                if (expectedCount) {
                    console.log('[Numbering IPC] Expected Count:', expectedCount)
                }

                const result = await validateNumbering(questionsPath, solutionsPath, expectedCount)

                const response: NumberingValidationResponse = {
                    success: true,
                    data: result
                }

                return response
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Validation failed'
                console.error('[Numbering IPC] Error:', error)

                const response: NumberingValidationResponse = {
                    success: false,
                    error: message
                }

                return response
            }
        }
    )

    // Single-file format validation handler
    ipcMain.handle(
        'numbering:validate-single-file',
        async (_event, filePath: string, expectedCount?: number) => {
            try {
                console.log('[Single File IPC] Validation request received')
                console.log('[Single File IPC] File:', filePath)
                if (expectedCount) {
                    console.log('[Single File IPC] Expected Count:', expectedCount)
                }

                const result = await validateSingleFile(filePath, expectedCount)
                console.log('[Single File IPC] Validation result:', result)

                const response: SingleFileValidationResponse = {
                    success: result.success,
                    data: result
                }

                console.log('[Single File IPC] Returning response:', response)
                return response
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Validation failed'
                console.error('[Single File IPC] Error:', error)

                const response: SingleFileValidationResponse = {
                    success: false,
                    error: message
                }

                console.log('[Single File IPC] Returning error response:', response)
                return response
            }
        }
    )

    console.log('[Numbering IPC] Handlers registered')
}

export function unregisterNumberingIpcHandlers(): void {
    ipcMain.removeHandler('numbering:validate')
    ipcMain.removeHandler('numbering:validate-single-file')
    console.log('[Numbering IPC] Handlers unregistered')
}
