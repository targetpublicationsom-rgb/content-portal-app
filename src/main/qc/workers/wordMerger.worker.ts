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

  // PowerShell script to merge documents
  const psScript = `
    try {
      $ErrorActionPreference = 'Stop'
      
      # Start Word application
      $word = New-Object -ComObject Word.Application
      $word.Visible = $false
      $word.DisplayAlerts = 0
      
      Write-Host "[WordMerger] Opening MCQs document..."
      # Open MCQs document
      $mcqsDoc = $word.Documents.Open("${absMcqsPath}", $false, $false, $false)
      
      Write-Host "[WordMerger] Opening Solution document..."
      # Open Solution document (read-only)
      $solutionDoc = $word.Documents.Open("${absSolutionPath}", $false, $true, $false)
      
      Write-Host "[WordMerger] Merging documents..."
      # Move to end of MCQs document
      $mcqsDoc.Activate()
      $range = $mcqsDoc.Content
      $range.Collapse(0) # Collapse to end
      
      # Insert page break before adding solution content
      $range.InsertBreak(7) # wdPageBreak = 7
      
      # Copy all content from Solution document
      $solutionContent = $solutionDoc.Content
      $solutionContent.Copy()
      
      # Paste into MCQs document
      $range.Paste()
      
      Write-Host "[WordMerger] Saving merged document..."
      # Save as new file
      $mcqsDoc.SaveAs2("${absOutputPath}", 16) # wdFormatDocumentDefault = 16
      
      Write-Host "[WordMerger] Cleaning up..."
      # Close documents
      $solutionDoc.Close($false)
      $mcqsDoc.Close($false)
      $word.Quit()
      
      # Release COM objects
      [System.Runtime.Interopservices.Marshal]::ReleaseComObject($solutionDoc) | Out-Null
      [System.Runtime.Interopservices.Marshal]::ReleaseComObject($mcqsDoc) | Out-Null
      [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
      [System.GC]::Collect()
      [System.GC]::WaitForPendingFinalizers()
      
      Write-Host "[WordMerger] Merge completed successfully"
      exit 0
      
    } catch {
      Write-Error "Error: $_"
      Write-Error $_.Exception.Message
      
      # Cleanup on error
      if ($mcqsDoc) { $mcqsDoc.Close($false) }
      if ($solutionDoc) { $solutionDoc.Close($false) }
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
      if (code === 0) {
        // Verify output file exists
        if (fs.existsSync(outputPath)) {
          console.log(`[WordMerger] Successfully merged to: ${outputPath}`)
          resolve(outputPath)
        } else {
          reject(new Error('Merge completed but output file not found'))
        }
      } else {
        reject(new Error(`PowerShell script failed with code ${code}: ${stderr || stdout}`))
      }
    })

    ps.on('error', (err) => {
      reject(new Error(`Failed to start PowerShell: ${err.message}`))
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
          const mergedPath = await mergeDocxFiles(
            data.mcqsPath,
            data.solutionPath,
            data.outputPath
          )
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
