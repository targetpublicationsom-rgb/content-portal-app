import { spawn } from 'child_process'
import { app } from 'electron'
import path from 'path'
import type { NumberingValidationResult } from '../shared/numbering.types'

/**
 * Get the path to the numbering checker executable
 */
function getNumberingCheckerPath(): string {
    const isDev = !app.isPackaged

    if (isDev) {
        // Development: tools folder in project root
        return path.join(process.cwd(), 'tools', 'content-numbering-service.exe')
    } else {
        // Production: unpacked tools folder
        return path.join(process.resourcesPath, 'app.asar.unpacked', 'tools', 'content-numbering-service.exe')
    }
}

/**
 * Get the path to pandoc executable
 */
function getPandocPath(): string {
    const isDev = !app.isPackaged

    if (isDev) {
        // Development: tools folder in project root
        return path.join(process.cwd(), 'tools', 'pandoc.exe')
    } else {
        // Production: unpacked tools folder
        return path.join(process.resourcesPath, 'app.asar.unpacked', 'tools', 'pandoc.exe')
    }
}

/**
 * Validate numbering in question and solution DOCX files
 */
export async function validateNumbering(
    questionsPath: string,
    solutionsPath: string,
): Promise<NumberingValidationResult> {
    return new Promise((resolve, reject) => {
        const checkerPath = getNumberingCheckerPath()
        const pandocPath = getPandocPath()

        console.log('[Numbering Checker] Starting validation...')
        console.log('[Numbering Checker] Questions:', questionsPath)
        console.log('[Numbering Checker] Solutions:', solutionsPath)
        console.log('[Numbering Checker] Checker path:', checkerPath)
        console.log('[Numbering Checker] Pandoc path:', pandocPath)

        // Spawn the numbering checker process with JSON output flag
        const args = [
            questionsPath,
            solutionsPath,
            '--json'
        ]

        // Set PATH to include pandoc directory
        const env = {
            ...process.env,
            PATH: `${path.dirname(pandocPath)};${process.env.PATH}`
        }

        const checker = spawn(checkerPath, args, { env })

        let stdout = ''
        let stderr = ''

        checker.stdout.on('data', (data) => {
            stdout += data.toString()
        })

        checker.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        checker.on('error', (error) => {
            console.error('[Numbering Checker] Process error:', error)
            reject(new Error(`Failed to start numbering checker: ${error.message}`))
        })

        checker.on('close', (code) => {
            console.log('[Numbering Checker] Process exited with code:', code)

            if (stderr) {
                console.error('[Numbering Checker] stderr:', stderr)
            }

            try {
                // The executable may output informational text along with JSON
                // Extract just the JSON portion (everything between first { and last })
                const firstBrace = stdout.indexOf('{')
                const lastBrace = stdout.lastIndexOf('}')

                if (firstBrace === -1 || lastBrace === -1) {
                    console.error('[Numbering Checker] No JSON found in output')
                    console.error('[Numbering Checker] Raw stdout:', stdout)
                    reject(new Error('No JSON data found in validation output'))
                    return
                }

                const jsonStr = stdout.substring(firstBrace, lastBrace + 1)
                console.log('[Numbering Checker] Extracted JSON:', jsonStr)

                // Parse JSON output from stdout
                const result = JSON.parse(jsonStr) as NumberingValidationResult
                console.log('[Numbering Checker] Validation result:', result)
                resolve(result)
            } catch (error) {
                console.error('[Numbering Checker] Failed to parse JSON output:', error)
                console.error('[Numbering Checker] Raw stdout:', stdout)
                reject(new Error(`Failed to parse validation results: ${error instanceof Error ? error.message : 'Unknown error'}`))
            }
        })
    })
}
