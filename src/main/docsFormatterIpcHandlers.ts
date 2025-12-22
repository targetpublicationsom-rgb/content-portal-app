import { ipcMain } from 'electron'
import { spawn } from 'child_process'
import { app } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'

interface DocsFormatterResponse {
    success: boolean
    outputPath?: string
    error?: string
}

/**
 * Get the path to the docs formatter executable
 */
function getDocsFormatterPath(): string {
    const isDev = !app.isPackaged

    if (isDev) {
        // Development: tools folder in project root
        return path.join(process.cwd(), 'tools', 'content-docx-formatter.exe')
    } else {
        // Production: unpacked tools folder
        return path.join(process.resourcesPath, 'app.asar.unpacked', 'tools', 'content-docx-formatter.exe')
    }
}

/**
 * Format a DOCX file using the content-docx-formatter executable
 * @param inputPath - Path to input DOCX file
 * @param formatType - Format type (1 = two sections, 2 = three sections)
 */
async function formatDocx(inputPath: string, formatType: number): Promise<DocsFormatterResponse> {
    return new Promise((resolve) => {
        const formatterPath = getDocsFormatterPath()

        // Generate output path in temp directory
        const tempDir = os.tmpdir()
        const inputBasename = path.basename(inputPath, '.docx')
        const timestamp = Date.now()
        const outputFilename = `${inputBasename}_formatted_${formatType}section_${timestamp}.docx`
        const outputPath = path.join(tempDir, outputFilename)

        console.log('[Docs Formatter] Starting formatting...')
        console.log('[Docs Formatter] Input:', inputPath)
        console.log('[Docs Formatter] Output:', outputPath)
        console.log('[Docs Formatter] Format type:', formatType)
        console.log('[Docs Formatter] Formatter path:', formatterPath)

        // Verify input file exists
        if (!fs.existsSync(inputPath)) {
            console.error('[Docs Formatter] Input file not found:', inputPath)
            resolve({
                success: false,
                error: 'Input file not found'
            })
            return
        }

        // Verify formatter executable exists
        if (!fs.existsSync(formatterPath)) {
            console.error('[Docs Formatter] Formatter executable not found:', formatterPath)
            resolve({
                success: false,
                error: 'Formatter executable not found'
            })
            return
        }

        // Build args: input_docx output_docx format
        const args = [inputPath, outputPath, formatType.toString()]

        const formatter = spawn(formatterPath, args)

        let stdout = ''
        let stderr = ''

        formatter.stdout.on('data', (data) => {
            stdout += data.toString()
            console.log('[Docs Formatter] stdout:', data.toString())
        })

        formatter.stderr.on('data', (data) => {
            stderr += data.toString()
            console.error('[Docs Formatter] stderr:', data.toString())
        })

        formatter.on('error', (error) => {
            console.error('[Docs Formatter] Process error:', error)
            resolve({
                success: false,
                error: `Failed to start formatter: ${error.message}`
            })
        })

        formatter.on('close', (code) => {
            console.log('[Docs Formatter] Process exited with code:', code)

            if (code === 0) {
                // Check if output file was created
                if (fs.existsSync(outputPath)) {
                    console.log('[Docs Formatter] Output file created successfully')
                    resolve({
                        success: true,
                        outputPath: outputPath
                    })
                } else {
                    console.error('[Docs Formatter] Output file was not created')
                    resolve({
                        success: false,
                        error: 'Output file was not created'
                    })
                }
            } else {
                console.error('[Docs Formatter] Formatting failed with code:', code)
                const errorMessage = stderr || stdout || `Process exited with code ${code}`
                resolve({
                    success: false,
                    error: errorMessage
                })
            }
        })
    })
}

export function registerDocsFormatterIpcHandlers(): void {
    // Format DOCX handler
    ipcMain.handle(
        'docs-formatter:format',
        async (_event, inputPath: string, formatType: number) => {
            try {
                console.log('[Docs Formatter IPC] Format request received')
                console.log('[Docs Formatter IPC] Input:', inputPath)
                console.log('[Docs Formatter IPC] Format type:', formatType)

                const result = await formatDocx(inputPath, formatType)
                console.log('[Docs Formatter IPC] Result:', result)

                return result
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Formatting failed'
                console.error('[Docs Formatter IPC] Error:', error)

                const response: DocsFormatterResponse = {
                    success: false,
                    error: message
                }

                return response
            }
        }
    )

    console.log('[Docs Formatter IPC] Handlers registered')
}

export function unregisterDocsFormatterIpcHandlers(): void {
    ipcMain.removeHandler('docs-formatter:format')
    console.log('[Docs Formatter IPC] Handlers unregistered')
}
