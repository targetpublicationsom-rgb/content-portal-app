import { Notification, BrowserWindow } from 'electron'
import * as path from 'path'

let mainWindow: BrowserWindow | null = null

export function initializeQCNotifications(window: BrowserWindow): void {
  mainWindow = window
  console.log('[QCNotifications] Initialized')
}

export function notifyQCStarted(filename: string): void {
  showNotification('QC Started', `Converting ${filename} to PDF...`, 'info')
}

export function notifyConversionComplete(filename: string): void {
  showNotification('Conversion Complete', `${filename} converted successfully`, 'info')
}

export function notifyQCSubmitted(filename: string): void {
  showNotification('QC Submitted', `${filename} sent for quality check`, 'info')
}

export function notifyQCProcessing(filename: string): void {
  showNotification('QC In Progress', `Analyzing ${filename}...`, 'info')
}

export function notifyQCCompleted(filename: string, score: number | null): void {
  const message = 'Report ready'
  showNotification(`QC Complete: ${filename}`, message, 'success')
}

export function notifyQCFailed(filename: string, error: string): void {
  showNotification(`QC Failed: ${filename}`, error, 'error')
}

export function notifyBatchComplete(count: number, avgScore: number): void {
  showNotification(
    'Batch Processing Complete',
    `Processed ${count} files. Avg Score: ${avgScore.toFixed(1)}/100`,
    'success'
  )
}

export function notifyServiceOffline(): void {
  showNotification('QC Service Offline', 'Cannot connect to external QC service', 'error')
}

export function notifyQueueStatus(queueLength: number): void {
  if (queueLength > 5) {
    showNotification('QC Queue Status', `${queueLength} files waiting for conversion`, 'info')
  }
}

function showNotification(
  title: string,
  body: string,
  type: 'info' | 'success' | 'warning' | 'error'
): void {
  // Check if notifications are supported
  if (!Notification.isSupported()) {
    console.warn('[QCNotifications] Notifications not supported on this system')
    return
  }

  const notification = new Notification({
    title,
    body,
    silent: false,
    urgency: type === 'error' ? 'critical' : 'normal'
  })

  notification.on('click', () => {
    // Focus the app window and navigate to QC page
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show()
      }
      mainWindow.focus()

      // Send IPC to navigate to QC page
      mainWindow.webContents.send('navigate-to', '/qc')
    }
  })

  notification.show()

  console.log(`[QCNotifications] Shown: ${title} - ${body}`)
}

export function getNotificationIcon(type: 'info' | 'success' | 'warning' | 'error'): string {
  // Return appropriate icon path based on type
  // This can be customized with actual icon files
  const iconMap = {
    info: 'info.png',
    success: 'success.png',
    warning: 'warning.png',
    error: 'error.png'
  }

  return path.join(__dirname, '../../resources', iconMap[type])
}
