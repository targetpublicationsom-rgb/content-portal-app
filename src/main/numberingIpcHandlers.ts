import { ipcMain } from 'electron'
import { validateNumbering } from './numberingChecker'
import type { NumberingValidationResponse } from '../shared/numbering.types'

export function registerNumberingIpcHandlers(): void {
    ipcMain.handle(
        'numbering:validate',
        async (_event, questionsPath: string, solutionsPath: string, expectedCount: number = 444) => {
            try {
                console.log('[Numbering IPC] Validation request received')
                console.log('[Numbering IPC] Questions:', questionsPath)
                console.log('[Numbering IPC] Solutions:', solutionsPath)
                console.log('[Numbering IPC] Expected count:', expectedCount)

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

    console.log('[Numbering IPC] Handlers registered')
}

export function unregisterNumberingIpcHandlers(): void {
    ipcMain.removeHandler('numbering:validate')
    console.log('[Numbering IPC] Handlers unregistered')
}
