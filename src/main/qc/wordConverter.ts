import * as path from 'path'
import * as fs from 'fs'
import { EventEmitter } from 'events'
import { exec } from 'child_process'
import winax from 'winax'

// Word COM objects don't have TypeScript definitions
/* eslint-disable @typescript-eslint/no-explicit-any */

interface ConversionJob {
  docxPath: string
  pdfPath: string
  resolve: (pdfPath: string) => void
  reject: (error: Error) => void
}

class WordConverter extends EventEmitter {
  private wordApp: any = null
  private isInitialized = false
  private conversionQueue: ConversionJob[] = []
  private isProcessing = false
  private conversionCount = 0
  private readonly MAX_CONVERSIONS_BEFORE_RESTART = 50

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[WordConverter] Already initialized')
      return
    }

    try {
      console.log('[WordConverter] Initializing Word COM instance...')
      this.wordApp = new winax.Object('Word.Application', { activate: false, type: true })
      this.wordApp.Visible = false
      this.wordApp.DisplayAlerts = 0 // wdAlertsNone
      this.isInitialized = true
      console.log('[WordConverter] Word instance initialized successfully')
    } catch (error) {
      console.error('[WordConverter] Failed to initialize Word:', error)
      throw new Error(`Failed to initialize Word: ${error}`)
    }
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized || !this.wordApp) {
      return
    }

    try {
      console.log('[WordConverter] Shutting down Word instance...')

      // Close all open documents first
      try {
        if (this.wordApp.Documents && this.wordApp.Documents.Count > 0) {
          this.wordApp.Documents.Close(false)
        }
      } catch (docError) {
        console.warn('[WordConverter] Error closing documents:', docError)
      }

      // Quit Word application
      try {
        if (typeof this.wordApp.Quit === 'function') {
          this.wordApp.Quit()
        } else if (this.wordApp.Quit) {
          // Try calling it directly if it's a COM method
          this.wordApp.Quit(0) // wdDoNotSaveChanges = 0
        }
      } catch (quitError) {
        console.warn('[WordConverter] Error calling Quit:', quitError)
        // Force kill Word processes as fallback
        this.forceKillWord()
      }

      // Release the COM object
      this.wordApp = null
      this.isInitialized = false

      console.log('[WordConverter] Word instance shut down')
    } catch (error) {
      console.error('[WordConverter] Error shutting down Word:', error)
      // Force cleanup even on error
      this.wordApp = null
      this.isInitialized = false
      this.forceKillWord()
    }
  }

  private forceKillWord(): void {
    try {
      console.log('[WordConverter] Force killing Word processes...')
      exec('taskkill /F /IM WINWORD.EXE', (error) => {
        if (error && !error.message.includes('not found')) {
          console.warn('[WordConverter] Error force killing Word:', error.message)
        } else {
          console.log('[WordConverter] Word processes terminated')
        }
      })
    } catch (error) {
      console.warn('[WordConverter] Could not force kill Word:', error)
    }
  }

  async restart(): Promise<void> {
    console.log('[WordConverter] Restarting Word instance...')
    await this.shutdown()
    await this.initialize()
  }

  async convertDocxToPdf(docxPath: string, pdfPath?: string): Promise<string> {
    // Ensure Word is initialized
    if (!this.isInitialized) {
      await this.initialize()
    }

    // Generate PDF path if not provided
    const outputPath =
      pdfPath || path.join(path.dirname(docxPath), `${path.basename(docxPath, '.docx')}.pdf`)

    return new Promise((resolve, reject) => {
      const job: ConversionJob = {
        docxPath,
        pdfPath: outputPath,
        resolve,
        reject
      }

      this.conversionQueue.push(job)
      this.emit('queue-update', this.conversionQueue.length)

      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue()
      }
    })
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.conversionQueue.length === 0) {
      return
    }

    this.isProcessing = true

    while (this.conversionQueue.length > 0) {
      const job = this.conversionQueue.shift()
      if (!job) continue

      try {
        await this.convertSingleFile(job.docxPath, job.pdfPath)
        job.resolve(job.pdfPath)
      } catch (error) {
        job.reject(error as Error)
      }

      this.emit('queue-update', this.conversionQueue.length)
    }

    this.isProcessing = false
  }

  private async convertSingleFile(docxPath: string, pdfPath: string): Promise<void> {
    // Check if source file exists
    if (!fs.existsSync(docxPath)) {
      throw new Error(`Source file not found: ${docxPath}`)
    }

    // Ensure output directory exists
    const outputDir = path.dirname(pdfPath)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    console.log(`[WordConverter] Converting: ${path.basename(docxPath)}`)
    this.emit('conversion-start', { docxPath, pdfPath })

    const startTime = Date.now()
    let doc: any = null

    try {
      // Convert paths to absolute Windows paths
      const absDocxPath = path.resolve(docxPath)
      const absPdfPath = path.resolve(pdfPath)

      // Open document
      doc = this.wordApp.Documents.Open(absDocxPath, false, true) // ReadOnly = true

      // Export as PDF (wdExportFormatPDF = 17)
      const wdExportFormatPDF = 17
      doc.ExportAsFixedFormat(
        absPdfPath,
        wdExportFormatPDF,
        false, // OpenAfterExport
        0, // Quality (0 = standard, 1 = minimum)
        false, // IncludeDocProps
        0, // From (0 = whole document)
        0, // To (0 = whole document)
        0 // Item (0 = content only)
      )

      const duration = ((Date.now() - startTime) / 1000).toFixed(2)
      console.log(
        `[WordConverter] Converted successfully in ${duration}s: ${path.basename(pdfPath)}`
      )

      this.conversionCount++
      this.emit('conversion-complete', { docxPath, pdfPath, duration: parseFloat(duration) })

      // Restart Word after MAX_CONVERSIONS_BEFORE_RESTART to prevent memory leaks
      if (this.conversionCount >= this.MAX_CONVERSIONS_BEFORE_RESTART) {
        console.log(
          `[WordConverter] Reached ${this.conversionCount} conversions, restarting Word...`
        )
        this.conversionCount = 0
        await this.restart()
      }
    } catch (error) {
      console.error('[WordConverter] Conversion failed:', error)
      this.emit('conversion-error', { docxPath, error })
      throw new Error(`Conversion failed: ${error}`)
    } finally {
      // Always close the document
      try {
        if (doc) {
          doc.Close(false) // Don't save changes
        }
      } catch (closeError) {
        console.error('[WordConverter] Error closing document:', closeError)
      }
    }
  }

  getQueueLength(): number {
    return this.conversionQueue.length
  }

  isReady(): boolean {
    return this.isInitialized && this.wordApp !== null
  }
}

// Singleton instance
let converterInstance: WordConverter | null = null

export function getWordConverter(): WordConverter {
  if (!converterInstance) {
    converterInstance = new WordConverter()
  }
  return converterInstance
}

export async function initializeWordConverter(): Promise<void> {
  const converter = getWordConverter()
  await converter.initialize()
}

export async function shutdownWordConverter(): Promise<void> {
  if (converterInstance) {
    await converterInstance.shutdown()
    converterInstance = null
  }
}

export async function convertDocxToPdf(docxPath: string, pdfPath?: string): Promise<string> {
  const converter = getWordConverter()
  return converter.convertDocxToPdf(docxPath, pdfPath)
}
