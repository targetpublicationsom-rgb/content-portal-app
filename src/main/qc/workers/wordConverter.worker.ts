/**
 * Word Converter Worker
 * Handles DOCX to PDF conversion using Microsoft Word COM in a separate thread
 */

import { parentPort, workerData } from 'worker_threads'
import * as path from 'path'
import * as fs from 'fs'
import type { WorkerMessage, WorkerResponse } from './types'

let wordApp: unknown = null
let conversionCount = 0
const MAX_CONVERSIONS_BEFORE_RESTART = 50

/**
 * Initialize Word COM instance
 */
async function initializeWord(): Promise<void> {
  try {
    // Dynamic import of winax (COM automation)
    let winax
    try {
      const winaxModule = await import('winax')
      // winax exports default, need to get it from .default
      winax = winaxModule.default || winaxModule
    } catch (importError) {
      const errorMsg = 'winax module not found. Please install: npm install winax'
      console.error('[WordWorker]', errorMsg, importError)
      
      if (parentPort) {
        parentPort.postMessage({
          id: 'init',
          type: 'error',
          error: { message: errorMsg }
        } as WorkerResponse)
      }
      throw new Error(errorMsg)
    }

    wordApp = new winax.Object('Word.Application', { activate: false, type: true })
    const app = wordApp as {
      Visible: boolean
      DisplayAlerts: number
      ScreenUpdating: boolean
      Documents: { Open: (path: string, confirmConversions: boolean, readOnly: boolean) => unknown }
      Quit: () => void
    }
    app.Visible = false
    app.DisplayAlerts = 0 // wdAlertsNone
    app.ScreenUpdating = false // Disable screen updates for better performance

    console.log('[WordWorker] Word COM initialized')

    if (parentPort) {
      parentPort.postMessage({
        id: 'init',
        type: 'success',
        data: { message: 'Word COM initialized' }
      } as WorkerResponse)
    }
  } catch (error) {
    console.error('[WordWorker] Failed to initialize Word:', error)
    
    if (parentPort) {
      parentPort.postMessage({
        id: 'init',
        type: 'error',
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }
      } as WorkerResponse)
    }
    throw error
  }
}

/**
 * Shutdown Word COM instance
 */
async function shutdownWord(): Promise<void> {
  if (wordApp) {
    try {
      ;(wordApp as { Quit: () => void }).Quit()
      wordApp = null
      conversionCount = 0
      console.log('[WordWorker] Word COM shut down')
    } catch (error) {
      console.error('[WordWorker] Error shutting down Word:', error)
    }
  }
}

/**
 * Restart Word if needed (after too many conversions)
 */
async function restartWordIfNeeded(): Promise<void> {
  if (conversionCount >= MAX_CONVERSIONS_BEFORE_RESTART) {
    console.log(`[WordWorker] Restarting Word after ${conversionCount} conversions`)
    await shutdownWord()
    await initializeWord()
  }
}

/**
 * Convert DOCX to PDF using Word COM
 */
async function convertDocxToPdf(
  messageId: string,
  docxPath: string,
  pdfPath: string
): Promise<void> {
  if (!wordApp) {
    throw new Error('Word COM not initialized')
  }

  // Verify Word COM is still functional
  try {
    const app = wordApp as { Documents?: unknown }
    if (!app.Documents) {
      console.error('[WordWorker] Word COM Documents is undefined, reinitializing...')
      await shutdownWord()
      await initializeWord()
      
      if (!wordApp) {
        throw new Error('Failed to reinitialize Word COM')
      }
    }
  } catch (checkError) {
    console.error('[WordWorker] Word COM check failed:', checkError)
    await shutdownWord()
    await initializeWord()
  }

  const absDocxPath = path.resolve(docxPath)
  const absPdfPath = path.resolve(pdfPath)

  // Check source file exists
  if (!fs.existsSync(absDocxPath)) {
    throw new Error(`Source file not found: ${absDocxPath}`)
  }

  // Check if file is locked or in use
  try {
    const fd = fs.openSync(absDocxPath, 'r+')
    fs.closeSync(fd)
  } catch (lockError) {
    throw new Error(
      `Source file is locked or in use: ${absDocxPath}. Please close the file in Word and retry.`
    )
  }

  // Ensure output directory exists
  const outputDir = path.dirname(absPdfPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const startTime = Date.now()
  let doc: unknown = null

  // Type aliases for COM objects
  type WordApp = {
    Documents: { Open: (path: string, confirmConversions: boolean, readOnly: boolean) => unknown }
    ActiveDocument?: unknown
  }
  type WordDoc = {
    SaveAs: (path: string, format: number) => void
    Close: (saveChanges: boolean) => void
    Activate?: () => void
  }

  try {
    // Progress: Opening document
    if (parentPort) {
      parentPort.postMessage({
        id: messageId,
        type: 'progress',
        data: { stage: 'opening', progress: 10 }
      } as WorkerResponse)
    }

    // Open document with additional options to avoid memory/font errors
    // ConfirmConversions=false, ReadOnly=true, AddToRecentFiles=false, NoEncodingDialog=true
    doc = (wordApp as WordApp).Documents.Open(absDocxPath, false, true)
    
    // Small delay to ensure document is fully loaded
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Progress: Converting
    if (parentPort) {
      parentPort.postMessage({
        id: messageId,
        type: 'progress',
        data: { stage: 'converting', progress: 40 }
      } as WorkerResponse)
    }

    // Delete existing PDF if it exists (can cause issues)
    if (fs.existsSync(absPdfPath)) {
      try {
        fs.unlinkSync(absPdfPath)
      } catch (e) {
        console.log('[WordWorker] Could not delete existing PDF:', e)
      }
    }

    // Save as PDF (wdFormatPDF = 17)
    // Using try-catch with multiple retry attempts
    let saveAttempts = 0
    const maxSaveAttempts = 3
    let saveSuccess = false

    while (!saveSuccess && saveAttempts < maxSaveAttempts) {
      try {
        saveAttempts++
        
        // Activate document before saving (helps with focus issues)
        if ((doc as WordDoc).Activate) {
          try {
            ;(doc as WordDoc).Activate!()
          } catch (activateError) {
            console.log('[WordWorker] Could not activate document (non-critical)')
          }
        }

        // Ensure output directory exists
        const pdfDir = path.dirname(absPdfPath)
        if (!fs.existsSync(pdfDir)) {
          fs.mkdirSync(pdfDir, { recursive: true })
        }

        console.log(`[WordWorker] SaveAs attempt ${saveAttempts}/${maxSaveAttempts}: ${absPdfPath}`)
        ;(doc as WordDoc).SaveAs(absPdfPath, 17)
        saveSuccess = true
        console.log('[WordWorker] SaveAs succeeded')
      } catch (saveError: unknown) {
        const errMsg = saveError instanceof Error ? saveError.message : String(saveError)
        console.warn(
          `[WordWorker] SaveAs attempt ${saveAttempts}/${maxSaveAttempts} failed:`,
          errMsg
        )

        if (saveAttempts < maxSaveAttempts) {
          // Wait progressively longer between retries
          const waitTime = saveAttempts * 1000
          console.log(`[WordWorker] Waiting ${waitTime}ms before retry...`)
          await new Promise((resolve) => setTimeout(resolve, waitTime))

          // Try to recover Word COM if it seems corrupted
          if (
            errMsg.includes('Command failed') ||
            errMsg.includes('insufficient memory') ||
            errMsg.includes('RPC server')
          ) {
            console.log('[WordWorker] Attempting Word COM recovery...')
            try {
              // Try to close and reopen the document
              try {
                ;(doc as WordDoc).Close(false)
              } catch (e) {
                console.log('[WordWorker] Document already closed or inaccessible')
              }

              // Reinitialize Word
              await shutdownWord()
              await initializeWord()

              // Reopen document
              doc = (wordApp as WordApp).Documents.Open(absDocxPath, false, true)
              await new Promise((resolve) => setTimeout(resolve, 500))
              console.log('[WordWorker] Document reopened after Word restart')
            } catch (recoveryError) {
              console.error('[WordWorker] Word COM recovery failed:', recoveryError)
              // Continue to next attempt anyway
            }
          }
        } else {
          // Final attempt failed
          throw new Error(
            `Failed to save PDF after ${maxSaveAttempts} attempts. Last error: ${errMsg}`
          )
        }
      }
    }

    // Progress: Saving
    if (parentPort) {
      parentPort.postMessage({
        id: messageId,
        type: 'progress',
        data: { stage: 'saving', progress: 80 }
      } as WorkerResponse)
    }

    // Close document
    ;(doc as WordDoc).Close(false) // Don't save changes
    doc = null

    // Progress: Closing
    if (parentPort) {
      parentPort.postMessage({
        id: messageId,
        type: 'progress',
        data: { stage: 'closing', progress: 95 }
      } as WorkerResponse)
    }

    conversionCount++
    const duration = (Date.now() - startTime) / 1000

    console.log(`[WordWorker] Converted ${path.basename(docxPath)} in ${duration}s`)

    // Check if we need to restart Word
    await restartWordIfNeeded()

    // Send success response
    if (parentPort) {
      parentPort.postMessage({
        id: messageId,
        type: 'success',
        data: { pdfPath: absPdfPath, duration }
      } as WorkerResponse)
    }
  } catch (error: unknown) {
    console.error('[WordWorker] Conversion error:', error)

    // Try to close document if still open
    if (doc) {
      try {
        ;(doc as WordDoc).Close(false)
      } catch (closeError) {
        console.error('[WordWorker] Failed to close document:', closeError)
      }
    }

    // If Word COM is corrupted/lost, try to reinitialize it
    const errMsg = error instanceof Error ? error.message : String(error)
    const errCode = (error as { code?: number }).code

    if (
      errMsg.includes('Cannot read properties of undefined') ||
      errMsg.includes('insufficient memory') ||
      errMsg.includes('Command failed') ||
      errMsg.includes('RPC server') ||
      errCode === -2146824090 || // Command failed
      errCode === -2147352567 // Automation error
    ) {
      console.log('[WordWorker] Word COM error detected, attempting to restart Word...')
      try {
        await shutdownWord()
        await initializeWord()
        console.log('[WordWorker] Word COM restarted successfully')
      } catch (restartError) {
        console.error('[WordWorker] Failed to restart Word:', restartError)
      }
    }

    // Include more error details in the thrown error
    const detailedError = new Error(
      `Word conversion failed: ${errMsg}${errCode ? ` (code: ${errCode})` : ''}`
    )
    ;(detailedError as any).originalError = error
    throw detailedError
  }
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

        case 'convert-docx-to-pdf':
          await convertDocxToPdf(
            message.id,
            (message.data as { docxPath: string; pdfPath: string }).docxPath,
            (message.data as { docxPath: string; pdfPath: string }).pdfPath
          )
          break

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

// Initialize Word on worker startup
if (workerData?.autoInit !== false) {
  initializeWord().catch((error) => {
    console.error('[WordWorker] Failed to auto-initialize:', error)
    // Don't exit immediately - let the parent handle the error message
    // process.exit(1)
  })
}
