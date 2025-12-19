import { spawn } from 'child_process'
import { app } from 'electron'
import path from 'path'
import type { SingleFileValidationResult, NumberingValidationResult } from '../shared/numbering.types'

/**
 * Get the path to the single file checker executable
 */
function getSingleFileCheckerPath(): string {
  const isDev = !app.isPackaged

  if (isDev) {
    // Development: tools folder in project root
    return path.join(process.cwd(), 'tools', 'content-numbering-service-single.exe')
  } else {
    // Production: unpacked tools folder
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'tools', 'content-numbering-service-single.exe')
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
 * Convert two-file format result to single-file format
 * This handles the case where the executable returns the old format
 */
function convertToSingleFileFormat(result: any): SingleFileValidationResult {
  // If it's already in single-file format, return as is
  if ('blocks_found' in result && 'questions' in result && typeof result.questions === 'object' && 'count' in result.questions) {
    return result
  }

  // Handle error response from single-file checker (no delimiters found, etc)
  if ('error' in result && result.blocks_found === 0) {
    return {
      success: false,
      blocks_found: result.blocks_found || 0,
      questions: {
        count: result.questions_count || 0,
        numbers: []
      },
      solutions: {
        count: result.solutions_count || 0,
        numbers: []
      },
      issues: result.issues || [result.error],
      expected_count: null
    }
  }

  // If it's in two-file format, convert it
  if ('status' in result && 'summary' in result) {
    const twoFileResult = result as NumberingValidationResult
    
    // For single-file format:
    // - Single block: questions only (solutions count = 0)
    // - Two blocks: questions and solutions
    const hasQuestions = twoFileResult.summary.questions.count > 0
    const hasSolutions = twoFileResult.summary.solutions.count > 0
    const blocksFound = hasQuestions ? (hasSolutions ? 2 : 1) : 0

    return {
      success: twoFileResult.status === 'passed',
      blocks_found: blocksFound,
      questions: {
        count: twoFileResult.summary.questions.count,
        numbers: Array.isArray(twoFileResult.details.questions.numbers)
          ? twoFileResult.details.questions.numbers
          : []
      },
      solutions: {
        count: twoFileResult.summary.solutions.count,
        numbers: Array.isArray(twoFileResult.details.solutions.numbers)
          ? twoFileResult.details.solutions.numbers
          : []
      },
      issues: twoFileResult.issues,
      expected_count: twoFileResult.summary.questions.expected || null
    }
  }

  throw new Error('Unable to parse validation result format')
}

/**
 * Validate numbering in a single DOCX/HTML file with delimiter-separated blocks
 * @param filePath - Path to the DOCX/HTML file
 * @param expectedCount - Optional expected count of questions
 */
export async function validateSingleFile(
  filePath: string,
  expectedCount?: number
): Promise<SingleFileValidationResult> {
  return new Promise((resolve, reject) => {
    const checkerPath = getSingleFileCheckerPath()
    const pandocPath = getPandocPath()

    console.log('[Single File Checker] Starting validation...')
    console.log('[Single File Checker] File:', filePath)
    if (expectedCount) {
      console.log('[Single File Checker] Expected count:', expectedCount)
    }
    console.log('[Single File Checker] Checker path:', checkerPath)
    console.log('[Single File Checker] Pandoc path:', pandocPath)

    // Build args with optional expected count
    const args = [filePath, '--json']

    // Add expected count if provided
    if (expectedCount !== null && expectedCount !== undefined) {
      args.push('-e', expectedCount.toString())
    }

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
      console.error('[Single File Checker] Process error:', error)
      reject(new Error(`Failed to start single file checker: ${error.message}`))
    })

    checker.on('close', (code) => {
      console.log('[Single File Checker] Process exited with code:', code)

      if (stderr) {
        console.error('[Single File Checker] stderr:', stderr)
      }

      try {
        // The executable may output informational text along with JSON
        // Extract just the JSON portion (everything between first { and last })
        const firstBrace = stdout.indexOf('{')
        const lastBrace = stdout.lastIndexOf('}')

        if (firstBrace === -1 || lastBrace === -1) {
          console.error('[Single File Checker] No JSON found in output')
          console.error('[Single File Checker] Raw stdout:', stdout)
          reject(new Error('No JSON data found in validation output'))
          return
        }

        const jsonStr = stdout.substring(firstBrace, lastBrace + 1)
        console.log('[Single File Checker] Extracted JSON:', jsonStr)

        // Parse JSON output from stdout
        const rawResult = JSON.parse(jsonStr)
        console.log('[Single File Checker] Raw result:', rawResult)

        // Convert to single-file format if needed
        const result = convertToSingleFileFormat(rawResult)
        console.log('[Single File Checker] Converted result:', result)
        resolve(result)
      } catch (error) {
        console.error('[Single File Checker] Failed to parse JSON output:', error)
        console.error('[Single File Checker] Raw stdout:', stdout)
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        reject(new Error(`Failed to parse validation results: ${errorMsg}`))
      }
    })
  })
}

