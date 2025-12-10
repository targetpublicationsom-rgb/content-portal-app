import { parentPort } from 'worker_threads'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import type { WorkerMessage, WorkerResponse } from './types'

/**
 * Word Merger Worker
 * Merges two Word documents (MCQs + Solution) into a single document
 * Uses PowerShell COM automation with Microsoft Word
 */

// Timeout for merge operation (2 minutes)
const MERGE_TIMEOUT_MS = 120000

interface MergeDocxMessage {
  mcqsPath: string
  solutionPath: string
  outputPath: string
}

async function mergeDocxFiles(
  mcqsPath: string,
  solutionPath: string,
  outputPath: string
): Promise<string> {
  console.log(`[WordMerger] Starting merge: MCQs="${mcqsPath}" + Solution="${solutionPath}"`)

  // Validate input files exist
  if (!fs.existsSync(mcqsPath)) {
    throw new Error(`MCQs file not found: ${mcqsPath}`)
  }
  if (!fs.existsSync(solutionPath)) {
    throw new Error(`Solution file not found: ${solutionPath}`)
  }

  // Convert to absolute paths for PowerShell
  const absMcqsPath = path.resolve(mcqsPath).replace(/\\/g, '\\\\')
  const absSolutionPath = path.resolve(solutionPath).replace(/\\/g, '\\\\')
  const absOutputPath = path.resolve(outputPath).replace(/\\/g, '\\\\')

  // Create output directory if it doesn't exist
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Delete existing output file to prevent conflicts
  if (fs.existsSync(outputPath)) {
    console.log(`[WordMerger] Deleting existing output file: ${outputPath}`)
    fs.unlinkSync(outputPath)
  }

  // PowerShell script to merge documents using InsertFile for better performance
  const psScript = `
    try {
      $ErrorActionPreference = 'Stop'

      Write-Host "[WordMerger] Starting Word..."
      $word = New-Object -ComObject Word.Application
      $word.Visible = $false
      $word.DisplayAlerts = 0

      Write-Host "[WordMerger] Opening Solution document as base…"
      $solutionDoc = $word.Documents.Open("${absMcqsPath}", $false, $false)

      Write-Host "[WordMerger] Moving to START & inserting Questions before…"
      $range = $solutionDoc.Content
      $range.Collapse(0)        # wdCollapseStart = 0 (move to beginning)
      
      Write-Host "[WordMerger] Inserting Questions document at beginning…"
      $range.InsertFile("${absSolutionPath}")
      
      Write-Host "[WordMerger] Adding page break between sections…"
      $range.Collapse(1)        # Move to end of inserted content
      $range.InsertBreak(7)     # wdPageBreak = 7

      Write-Host "[WordMerger] Saving merged document…"
      $wdFormatXMLDocument = 12
      $solutionDoc.SaveAs2("${absOutputPath}", $wdFormatXMLDocument)

      Write-Host "[WordMerger] Cleaning up…"
      $solutionDoc.Close($false)
      $word.Quit()

      [System.Runtime.InteropServices.Marshal]::ReleaseComObject($range) | Out-Null
      [System.Runtime.InteropServices.Marshal]::ReleaseComObject($solutionDoc) | Out-Null
      [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null

      [GC]::Collect()
      [GC]::WaitForPendingFinalizers()

      Write-Host "[WordMerger] Merge success!"
      exit 0
    }
    catch {
      Write-Error "[WordMerger] FAILED: $($_.Exception.Message)"
      if ($mcqsDoc) { $mcqsDoc.Close($false) }
      if ($word) { $word.Quit() }
      exit 1
    }
  `

  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      psScript
    ])

    let stdout = ''
    let stderr = ''
    let timeoutId: NodeJS.Timeout | null = null
    let processKilled = false

    // Set timeout to prevent indefinite hanging
    timeoutId = setTimeout(() => {
      console.error('[WordMerger] Merge operation timed out after 2 minutes')
      processKilled = true
      
      // Try graceful termination first
      ps.kill('SIGTERM')
      
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!ps.killed) {
          console.error('[WordMerger] Force killing hung process')
          ps.kill('SIGKILL')
        }
      }, 5000)
      
      reject(
        new Error(
          'Word merge operation timed out - Word application may have hung. Please try again.'
        )
      )
    }, MERGE_TIMEOUT_MS)

    ps.stdout.on('data', (data) => {
      const output = data.toString()
      stdout += output
      console.log(`[WordMerger] ${output.trim()}`)
    })

    ps.stderr.on('data', (data) => {
      const error = data.toString()
      stderr += error
      console.error(`[WordMerger] ERROR: ${error.trim()}`)
    })

    ps.on('close', (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }

      if (processKilled) {
        // Already handled by timeout
        return
      }

      if (code === 0) {
        // Verify output file exists
        if (fs.existsSync(outputPath)) {
          // Validate file has content
          const stats = fs.statSync(outputPath)
          if (stats.size === 0) {
            reject(new Error('Merge completed but output file is empty (0 bytes)'))
            return
          }
          
          console.log(`[WordMerger] Successfully merged to: ${outputPath} (${stats.size} bytes)`)
          resolve(outputPath)
        } else {
          reject(new Error('Merge completed but output file not found at: ' + outputPath))
        }
      } else {
        const errorMsg = stderr || stdout || 'Unknown error'
        reject(new Error(`Word merge failed (exit code ${code}). Error: ${errorMsg}`))
      }
    })

    ps.on('error', (err) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      reject(new Error(`Failed to start PowerShell process: ${err.message}`))
    })
  })
}

// Worker message handler
if (parentPort) {
  parentPort.on('message', async (message: WorkerMessage) => {
    const response: WorkerResponse = {
      id: message.id,
      type: 'success',
      data: {}
    }

    try {
      switch (message.type) {
        case 'merge-docx': {
          const data = message.data as MergeDocxMessage
          const mergedPath = await mergeDocxFiles(data.mcqsPath, data.solutionPath, data.outputPath)
          response.type = 'success'
          response.data = { mergedPath }
          break
        }

        default:
          throw new Error(`Unknown message type: ${message.type}`)
      }
    } catch (error) {
      console.error(`[WordMerger] Error processing message ${message.id}:`, error)
      response.type = 'error'
      response.error = {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }
    }

    parentPort?.postMessage(response)
  })

  // Send ready signal
  parentPort.postMessage({
    id: 'init',
    type: 'success',
    data: { message: 'Word merger initialized' }
  })
  console.log('[WordMerger] Worker initialized and ready')
} else {
  console.error('[WordMerger] Worker not running in worker thread context')
}
