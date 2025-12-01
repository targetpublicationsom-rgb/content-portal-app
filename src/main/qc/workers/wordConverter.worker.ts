/**
 * Word Converter Worker
 * Handles DOCX to PDF conversion using PowerShell COM automation
 * This approach avoids winax dependency and provides better stability
 */

import { parentPort, workerData } from 'worker_threads'
import * as path from 'path'
import * as fs from 'fs'
import { spawn } from 'child_process'
import type { WorkerMessage, WorkerResponse } from './types'

let wordAvailable = false

/**
 * Initialize worker (verify PowerShell and Word are available)
 */
async function initializeWord(): Promise<void> {
  try {
    // Verify Word is installed by checking registry
    const wordPath = await getWordInstallPath()

    if (!wordPath) {
      console.warn('[WordWorker] Microsoft Word is not installed on this system - conversions will fail if requested')
      // Don't throw - just log warning and continue
      // This allows the worker to start in dev environments without Word
      wordAvailable = false
    } else {
      console.log('[WordWorker] Word found at:', wordPath)
      wordAvailable = true
    }

    if (parentPort) {
      parentPort.postMessage({
        id: 'init',
        type: 'success',
        data: { message: 'Word converter initialized', wordAvailable }
      } as WorkerResponse)
    }
  } catch (error) {
    console.warn('[WordWorker] Failed to initialize Word check:', error)

    // Don't throw on initialization errors - worker should still start
    // Actual conversion attempts will fail with a proper error
    wordAvailable = false

    if (parentPort) {
      parentPort.postMessage({
        id: 'init',
        type: 'success',
        data: { message: 'Word converter initialized with limitations' }
      } as WorkerResponse)
    }
  }
}

/**
 * Get Word installation path from registry
 */
function getWordInstallPath(): Promise<string | null> {
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      `(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Office\\*\\Common\\InstallRoot' -ErrorAction SilentlyContinue).Path | Select-Object -First 1`
    ])

    let output = ''
    ps.stdout.on('data', (data) => {
      output += data.toString().trim()
    })

    ps.on('close', () => {
      resolve(output || null)
    })

    ps.on('error', () => {
      resolve(null)
    })
  })
}

/**
 * Shutdown worker
 */
async function shutdownWord(): Promise<void> {
  wordAvailable = false
  console.log('[WordWorker] Shutdown complete')
}

/**
 * Convert DOCX to PDF using PowerShell
 */
async function convertDocxToPdf(
  messageId: string,
  docxPath: string,
  pdfPath: string
): Promise<void> {
  // Check if conversion is even possible
  if (!fs.existsSync(docxPath)) {
    throw new Error(`Source file not found: ${docxPath}`)
  }

  const absDocxPath = path.resolve(docxPath)
  const absPdfPath = path.resolve(pdfPath)

  // Check source file exists
  if (!fs.existsSync(absDocxPath)) {
    throw new Error(`Source file not found: ${absDocxPath}`)
  }

  // Ensure output directory exists
  const outputDir = path.dirname(absPdfPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Delete existing PDF if it exists
  if (fs.existsSync(absPdfPath)) {
    try {
      fs.unlinkSync(absPdfPath)
    } catch {
      console.log('[WordWorker] Could not delete existing PDF (file in use)')
    }
  }

  const startTime = Date.now()

  return new Promise((resolve, reject) => {
    try {
      // Send progress: starting
      if (parentPort) {
        parentPort.postMessage({
          id: messageId,
          type: 'progress',
          data: { stage: 'converting', progress: 20 }
        } as WorkerResponse)
      }

      // PowerShell script for Word COM automation with image compression
      const psScript = `
$ErrorActionPreference = 'Stop'

try {
    # Create Word COM object with minimal memory footprint
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0  # wdAlertsNone
    $word.ScreenUpdating = $false  # Disable screen updates to save memory
    
    # Open document in read-only mode to reduce memory usage
    $doc = $word.Documents.Open("${absDocxPath.replace(/\\/g, '\\\\')}", $false, $true, $false)
    
    try {
        # Compress images in the document to reduce memory usage
        # This is critical for large files with many images
        
        # Compress all inline shapes (images)
        if ($doc.InlineShapes.Count -gt 0) {
            Write-Host "Compressing $($doc.InlineShapes.Count) images..."
            foreach ($shape in $doc.InlineShapes) {
                # Set image compression for 150 DPI equivalent quality
                if ($shape.Type -eq 13) {  # 13 = Picture type
                    try {
                        $shape.PictureFormat.Compression = 2  # wdCompressionMedium (150 DPI)
                    } catch {
                        # Continue if compression fails for specific image
                    }
                }
            }
        }
        
        # Also compress shapes that contain images
        if ($doc.Shapes.Count -gt 0) {
            foreach ($shape in $doc.Shapes) {
                try {
                    if ($shape.Type -eq 13) {  # Picture type
                        $shape.PictureFormat.Compression = 2
                    }
                } catch {
                    # Continue if compression fails
                }
            }
        }
        
        # Export as PDF with optimized settings (skips saving to avoid locking issues)
        # Format 17 = wdFormatPDF
        $doc.ExportAsFixedFormat("${absPdfPath.replace(/\\/g, '\\\\')}", 17, $false, 0, 0, 0, 0, 7, $true)
        
        Write-Host "SUCCESS"
    } finally {
        # Close document without saving (PDF export doesn't require save)
        $doc.Close($false)
    }
} catch {
    Write-Error "Conversion failed: $_"
    exit 1
} finally {
    # Clean up Word to free all resources
    if ($word -ne $null) {
        $word.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
        Remove-Variable word -ErrorAction SilentlyContinue
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
    }
}
`

      const ps = spawn('powershell.exe', ['-NoProfile', '-Command', psScript], {
        timeout: 300000 // 5 minutes
      })

      let stdout = ''
      let stderr = ''

      ps.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      ps.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      ps.on('close', (code) => {
        const duration = (Date.now() - startTime) / 1000

        if (code === 0 && fs.existsSync(absPdfPath)) {
          console.log(`[WordWorker] Converted ${path.basename(docxPath)} in ${duration}s`)

          // Send success response
          if (parentPort) {
            parentPort.postMessage({
              id: messageId,
              type: 'success',
              data: { pdfPath: absPdfPath, duration }
            } as WorkerResponse)
          }
          resolve()
        } else {
          const errorMsg = stderr || stdout || `Process exited with code ${code}`
          console.error('[WordWorker] Conversion failed:', errorMsg)
          reject(new Error(`Word conversion failed: ${errorMsg}`))
        }
      })

      ps.on('error', (error) => {
        console.error('[WordWorker] PowerShell error:', error)
        reject(new Error(`PowerShell execution failed: ${error.message}`))
      })

      // Handle timeout
      const timeoutHandle = setTimeout(() => {
        ps.kill()
        reject(new Error('Word conversion timed out (5 minutes)'))
      }, 300000)

      ps.on('close', () => {
        clearTimeout(timeoutHandle)
      })
    } catch (error) {
      console.error('[WordWorker] Error initiating conversion:', error)
      reject(error)
    }
  })
}

/**
 * Message handler
 */
if (parentPort) {
  parentPort.on('message', async (message: WorkerMessage) => {
    try {
      switch (message.type) {
        case 'init':
          await initializeWord()
          break

        case 'convert-docx-to-pdf': {
          const data = message.data as { docxPath: string; pdfPath: string }
          await convertDocxToPdf(message.id, data.docxPath, data.pdfPath)
          break
        }

        default:
          throw new Error(`Unknown message type: ${message.type}`)

      }
    } catch (error: unknown) {
      console.error('[WordWorker] Error processing message:', error)

      if (parentPort) {
        parentPort.postMessage({
          id: message.id,
          type: 'error',
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          }
        } as WorkerResponse)
      }
    }
  })

  // Handle worker termination
  parentPort.on('close', async () => {
    console.log('[WordWorker] Shutting down...')
    await shutdownWord()
  })
}

// Initialize worker on startup
if (workerData?.autoInit !== false) {
  initializeWord().catch((error) => {
    console.error('[WordWorker] Failed to auto-initialize:', error)
  })
}
