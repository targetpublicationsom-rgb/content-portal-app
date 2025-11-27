/**
 * Report Parser Worker
 * Parses QC report markdown files to extract severity breakdown
 */

import { parentPort } from 'worker_threads'
import * as fs from 'fs'
import * as path from 'path'
import type { WorkerMessage, WorkerResponse } from './types'

/**
 * Parse QC report and extract severity counts
 */
async function parseReport(messageId: string, reportPath: string): Promise<void> {
  const absReportPath = path.resolve(reportPath)

  // Check report file exists
  if (!fs.existsSync(absReportPath)) {
    throw new Error(`Report file not found: ${absReportPath}`)
  }

  // Read report file
  const content = fs.readFileSync(absReportPath, 'utf-8')

  let issuesFound = 0
  let issuesLow = 0
  let issuesMedium = 0
  let issuesHigh = 0

  try {
    // Try to parse as JSON (if the report is in JSON format)
    const report = JSON.parse(content)

    if (report.findings && Array.isArray(report.findings)) {
      issuesFound = report.findings.length

      interface Finding {
        severity?: string
      }

      issuesLow = report.findings.filter((f: Finding) => f.severity === 'Low').length
      issuesMedium = report.findings.filter((f: Finding) => f.severity === 'Medium').length
      issuesHigh = report.findings.filter((f: Finding) => f.severity === 'High').length
    }
  } catch {
    // If not JSON, try to parse as markdown
    const lines = content.split('\n')

    for (const line of lines) {
      // Look for patterns like "- **Severity:** Low"
      const severityMatch = line.match(/\*\*Severity:\*\*\s*(Low|Medium|High)/i)
      if (severityMatch) {
        issuesFound++
        const severity = severityMatch[1].toLowerCase()

        if (severity === 'low') {
          issuesLow++
        } else if (severity === 'medium') {
          issuesMedium++
        } else if (severity === 'high') {
          issuesHigh++
        }
      }

      // Alternative pattern: "Severity: Low"
      const altMatch = line.match(/Severity:\s*(Low|Medium|High)/i)
      if (altMatch && !severityMatch) {
        issuesFound++
        const severity = altMatch[1].toLowerCase()

        if (severity === 'low') {
          issuesLow++
        } else if (severity === 'medium') {
          issuesMedium++
        } else if (severity === 'high') {
          issuesHigh++
        }
      }
    }
  }

  console.log(
    `[ReportParser] Parsed report: ${issuesFound} total (${issuesLow} Low, ${issuesMedium} Medium, ${issuesHigh} High)`
  )

  if (parentPort) {
    parentPort.postMessage({
      id: messageId,
      type: 'success',
      data: {
        issuesFound,
        issuesLow,
        issuesMedium,
        issuesHigh
      }
    } as WorkerResponse)
  }
}

/**
 * Message handler
 */
if (parentPort) {
  parentPort.on('message', async (message: WorkerMessage) => {
    try {
      switch (message.type) {
        case 'parse-report':
          await parseReport(message.id, (message.data as { reportPath: string }).reportPath)
          break

        default:
          throw new Error(`Unknown message type: ${message.type}`)
      }
    } catch (error: unknown) {
      console.error('[ReportParser] Error processing message:', error)

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

  // Signal ready
  parentPort.postMessage({
    id: 'init',
    type: 'success',
    data: { message: 'Report parser ready' }
  } as WorkerResponse)
}
