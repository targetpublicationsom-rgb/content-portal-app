/**
 * Pandoc Converter Worker
 * Handles Markdown to DOCX conversion using Pandoc in a separate thread
 */

import { parentPort } from 'worker_threads'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import type { WorkerMessage, WorkerResponse } from './types'

let pandocPath: string | null = null

/**
 * Initialize Pandoc path
 */
function initializePandoc(): void {
  // Determine if running in development or production
  const isDev = process.env.NODE_ENV === 'development' || !process.resourcesPath
  
  let possiblePaths: string[] = []
  
  if (isDev) {
    // Development: tools folder is at project root
    possiblePaths = [
      path.join(__dirname, '..', '..', '..', 'tools', 'pandoc.exe'),
      path.join(process.cwd(), 'tools', 'pandoc.exe')
    ]
  } else {
    // Production: tools are unpacked from asar at app.asar.unpacked/tools
    possiblePaths = [
      // Primary: in app.asar.unpacked (executables must be unpacked from asar)
      path.join(process.resourcesPath, 'app.asar.unpacked', 'tools', 'pandoc.exe'),
      // Alternative: extraResources location (if someone manually places it there)
      path.join(process.resourcesPath, '..', 'tools', 'pandoc.exe')
    ]
  }
  
  // Try each possible path
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      pandocPath = testPath
      console.log('[PandocWorker] Using bundled Pandoc:', pandocPath)
      break
    }
  }
  
  if (!pandocPath) {
    // Fall back to system Pandoc
    pandocPath = 'pandoc'
    console.log('[PandocWorker] Using system Pandoc (bundled not found in:', possiblePaths.join(', '), ')')
  }

  if (parentPort) {
    parentPort.postMessage({
      id: 'init',
      type: 'success',
      data: { message: 'Pandoc initialized', path: pandocPath }
    } as WorkerResponse)
  }
}

/**
 * Convert Markdown to DOCX using Pandoc
 */
async function convertMdToDocx(messageId: string, mdPath: string, docxPath: string): Promise<void> {
  if (!pandocPath) {
    throw new Error('Pandoc not initialized')
  }

  const absMdPath = path.resolve(mdPath)
  const absDocxPath = path.resolve(docxPath)

  // Check source file exists
  if (!fs.existsSync(absMdPath)) {
    throw new Error(`Source file not found: ${absMdPath}`)
  }

  // Ensure output directory exists
  const outputDir = path.dirname(absDocxPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  return new Promise((resolve, reject) => {
    if (!pandocPath) {
      reject(new Error('Pandoc not initialized'))
      return
    }

    // Enhanced Pandoc arguments for better DOCX output
    const args = [
      absMdPath,
      '-o', absDocxPath,
      '--from=markdown',
      '--to=docx',
      '--standalone', // Create a standalone document with proper structure
      '--wrap=auto', // Automatic line wrapping
      '--columns=80' // Set column width for better formatting
    ]

    console.log(`[PandocWorker] Running: ${pandocPath} ${args.join(' ')}`)

    const process = spawn(pandocPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    process.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    process.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    const timeout = setTimeout(() => {
      process.kill()
      reject(new Error('Pandoc conversion timed out after 30 seconds'))
    }, 30000)

    process.on('close', (code) => {
      clearTimeout(timeout)

      if (code === 0) {
        console.log(`[PandocWorker] Converted ${path.basename(mdPath)} to DOCX`)
        
        if (parentPort) {
          parentPort.postMessage({
            id: messageId,
            type: 'success',
            data: { docxPath: absDocxPath }
          } as WorkerResponse)
        }
        
        resolve()
      } else {
        const error = new Error(`Pandoc conversion failed with code ${code}: ${stderr || stdout}`)
        reject(error)
      }
    })

    process.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Pandoc process error: ${err.message}`))
    })
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
          initializePandoc()
          break

        case 'convert-md-to-docx':
          await convertMdToDocx(
            message.id,
            (message.data as { mdPath: string; docxPath: string }).mdPath,
            (message.data as { mdPath: string; docxPath: string }).docxPath
          )
          break

        default:
          throw new Error(`Unknown message type: ${message.type}`)
      }
    } catch (error: unknown) {
      console.error('[PandocWorker] Error processing message:', error)
      
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
}

// Initialize Pandoc on worker startup
initializePandoc()
