import { spawn, execSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

let pandocPath: string | null = null

// Initialize pandoc executable path
export function initializePandoc(): void {
  // Try bundled pandoc in app resources first
  const appPath = app.getAppPath()
  const bundledPandocPath = path.join(appPath, 'tools', 'pandoc.exe')

  if (fs.existsSync(bundledPandocPath)) {
    pandocPath = bundledPandocPath
    console.log(`[PandocConverter] Using bundled pandoc: ${pandocPath}`)
    return
  }

  // Try user data directory (for production builds)
  const userDataPath = app.getPath('userData')
  const userDataPandocPath = path.join(userDataPath, 'tools', 'pandoc', 'pandoc.exe')

  if (fs.existsSync(userDataPandocPath)) {
    pandocPath = userDataPandocPath
    console.log(`[PandocConverter] Using user data pandoc: ${pandocPath}`)
    return
  }

  // Fallback to system pandoc
  console.warn('[PandocConverter] Pandoc not found in bundle or user data. Trying system pandoc...')
  pandocPath = 'pandoc'
}

// Convert Markdown to DOCX using pandoc
export async function convertMdToDocx(mdPath: string, docxPath?: string): Promise<string> {
  if (!pandocPath) {
    initializePandoc()
  }

  // Generate output path if not provided
  const outputPath =
    docxPath || path.join(path.dirname(mdPath), `${path.basename(mdPath, '.md')}.docx`)

  // Check if input file exists
  if (!fs.existsSync(mdPath)) {
    throw new Error(`Markdown file not found: ${mdPath}`)
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  console.log(`[PandocConverter] Converting ${path.basename(mdPath)} to DOCX...`)

  return new Promise((resolve, reject) => {
    // Build command string with properly quoted paths for shell execution
    const command = `"${pandocPath}" "${mdPath}" -o "${outputPath}" --from=markdown --to=docx --standalone`

    const pandocProcess = spawn(command, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    })

    let stderr = ''

    pandocProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    pandocProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`[PandocConverter] Converted successfully: ${path.basename(outputPath)}`)
        resolve(outputPath)
      } else {
        const error = `Pandoc conversion failed with code ${code}: ${stderr}`
        console.error(`[PandocConverter] ${error}`)
        reject(new Error(error))
      }
    })

    pandocProcess.on('error', (error) => {
      console.error('[PandocConverter] Failed to spawn pandoc:', error)
      reject(new Error(`Failed to spawn pandoc: ${error.message}`))
    })

    // Timeout after 30 seconds
    setTimeout(() => {
      pandocProcess.kill()
      reject(new Error('Pandoc conversion timeout after 30 seconds'))
    }, 30000)
  })
}

// Check if pandoc is available
export function isPandocAvailable(): boolean {
  if (!pandocPath) {
    initializePandoc()
  }

  if (pandocPath === 'pandoc') {
    // Try system pandoc
    try {
      execSync('pandoc --version', { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  return pandocPath !== null && fs.existsSync(pandocPath)
}

export function getPandocPath(): string | null {
  return pandocPath
}
