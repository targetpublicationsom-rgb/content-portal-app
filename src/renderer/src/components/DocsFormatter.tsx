import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { FileType, Loader2, FolderOpen, Download, FileCheck } from 'lucide-react'
import toast from 'react-hot-toast'

type FormatType = 1 | 2
type TabType = 'format' | 'restore'

export default function DocsFormatter(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabType>('format')
  
  // Format tab state
  const [formatInputPath, setFormatInputPath] = useState('')
  const [formatType, setFormatType] = useState<FormatType>(1)
  const [isFormatting, setIsFormatting] = useState(false)
  const [formatOutputPath, setFormatOutputPath] = useState<string | null>(null)

  // Restore tab state
  const [restoreInputPath, setRestoreInputPath] = useState('')
  const [restoreFormatType, setRestoreFormatType] = useState<FormatType>(1)
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreOutputPath, setRestoreOutputPath] = useState<string | null>(null)

  const handleSelectFile = async (tab: TabType): Promise<void> => {
    try {
      const result = await window.api.dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Word Documents', extensions: ['docx'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        title: tab === 'format' ? 'Select DOCX File to Format' : 'Select Formatted DOCX File to Restore'
      })

      if (!result.canceled && result.filePaths.length > 0) {
        if (tab === 'format') {
          setFormatInputPath(result.filePaths[0])
          setFormatOutputPath(null)
        } else {
          setRestoreInputPath(result.filePaths[0])
          setRestoreOutputPath(null)
        }
      }
    } catch (error) {
      console.error('Error selecting file:', error)
      toast.error('Failed to select file')
    }
  }

  const handleFormat = async (): Promise<void> => {
    if (!formatInputPath) {
      toast.error('Please select a DOCX file')
      return
    }

    setIsFormatting(true)
    setFormatOutputPath(null)

    try {
      const result = await window.api.docsFormatter.format(formatInputPath, formatType)

      if (result.success && result.outputPath) {
        setFormatOutputPath(result.outputPath)
        toast.success('Document formatted successfully!')
      } else {
        toast.error(result.error || 'Formatting failed')
      }
    } catch (error) {
      console.error('Formatting error:', error)
      toast.error(error instanceof Error ? error.message : 'Formatting failed')
    } finally {
      setIsFormatting(false)
    }
  }

  const handleRestore = async (): Promise<void> => {
    if (!restoreInputPath) {
      toast.error('Please select a formatted DOCX file')
      return
    }

    setIsRestoring(true)
    setRestoreOutputPath(null)

    try {
      const result = await window.api.docsFormatter.restore(restoreInputPath, restoreFormatType)

      if (result.success && result.outputPath) {
        setRestoreOutputPath(result.outputPath)
        toast.success('Document restored successfully!')
      } else {
        toast.error(result.error || 'Restoration failed')
      }
    } catch (error) {
      console.error('Restoration error:', error)
      toast.error(error instanceof Error ? error.message : 'Restoration failed')
    } finally {
      setIsRestoring(false)
    }
  }

  const handleDownload = async (outputPath: string | null): Promise<void> => {
    if (!outputPath) return

    try {
      const result = await window.api.dialog.showSaveDialog({
        defaultPath: outputPath.split('\\').pop() || 'document.docx',
        filters: [{ name: 'Word Documents', extensions: ['docx'] }],
        title: 'Save Document'
      })

      if (!result.canceled && result.filePath) {
        const copyResult = await window.api.file.copy(outputPath, result.filePath)
        
        if (copyResult.success) {
          toast.success('File saved successfully!')
          await window.api.shell.openPath(result.filePath)
        } else {
          toast.error(copyResult.error || 'Failed to save file')
        }
      }
    } catch (error) {
      console.error('Download error:', error)
      toast.error('Failed to save file')
    }
  }

  const handleReset = (tab: TabType): void => {
    if (tab === 'format') {
      setFormatInputPath('')
      setFormatOutputPath(null)
      setFormatType(1)
    } else {
      setRestoreInputPath('')
      setRestoreOutputPath(null)
      setRestoreFormatType(1)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto mb-5">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileType className="h-6 w-6" />
          Docs Formatter
        </h1>
        <p className="text-muted-foreground mt-1">
          Format or restore DOCX files containing questions, options, answers, and explanations
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-card border rounded-lg p-1 mb-6 inline-flex gap-1">
        <button
          onClick={() => setActiveTab('format')}
          className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
            activeTab === 'format'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Format Document
        </button>
        <button
          onClick={() => setActiveTab('restore')}
          className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
            activeTab === 'restore'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Restore Document
        </button>
      </div>

      {/* Format Information */}
      <div className="bg-muted/30 border rounded-lg p-4 mb-6 text-sm">
        {activeTab === 'format' ? (
          <p>
            <strong>Format Document:</strong> Converts a single DOCX file into multi-section format.
            Choose between two-section (Questions + Answers/Explanations) or three-section format
            (Questions + Answers + Explanations).
          </p>
        ) : (
          <p>
            <strong>Restore Document:</strong> Converts a multi-section formatted DOCX file back to
            a single file. Select the format type that matches your input file (two-section or
            three-section).
          </p>
        )}
      </div>

      {/* Format Tab */}
      {activeTab === 'format' && (
        <>
          <div className="bg-card border rounded-lg p-6 space-y-5">
            {/* File Selection */}
            <div className="space-y-2">
              <Label htmlFor="format-input-file">Input DOCX File</Label>
              <div className="flex gap-2">
                <Input
                  id="format-input-file"
                  type="text"
                  value={formatInputPath}
                  onChange={(e) => setFormatInputPath(e.target.value)}
                  placeholder="Select DOCX file to format..."
                  className="flex-1"
                  disabled={isFormatting}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSelectFile('format')}
                  disabled={isFormatting}
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Browse
                </Button>
              </div>
            </div>

            {/* Format Selection */}
            <div className="space-y-3">
              <Label>Output Format</Label>
              <div className="space-y-2">
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors">
                  <input
                    type="radio"
                    name="format"
                    value="1"
                    checked={formatType === 1}
                    onChange={() => setFormatType(1)}
                    disabled={isFormatting}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium">Two Section Format</div>
                    <div className="text-sm text-muted-foreground">
                      Questions section followed by Answers and Explanations section
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors">
                  <input
                    type="radio"
                    name="format"
                    value="2"
                    checked={formatType === 2}
                    onChange={() => setFormatType(2)}
                    disabled={isFormatting}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium">Three Section Format</div>
                    <div className="text-sm text-muted-foreground">
                      Questions, Answers, and Explanations in separate sections
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t flex gap-3">
              <Button
                onClick={handleFormat}
                disabled={isFormatting || !formatInputPath}
                className="flex-1 sm:flex-initial"
              >
                {isFormatting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Formatting...
                  </>
                ) : (
                  <>
                    <FileCheck className="h-4 w-4 mr-2" />
                    Format Document
                  </>
                )}
              </Button>

              {formatOutputPath && (
                <>
                  <Button onClick={() => handleDownload(formatOutputPath)} variant="default" className="flex-1 sm:flex-initial">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button onClick={() => handleReset('format')} variant="outline">
                    Reset
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Success Message */}
          {formatOutputPath && (
            <div className="mt-6 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <FileCheck className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-medium text-green-900 dark:text-green-100">
                    Document Formatted Successfully
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    Your document has been formatted and is ready to download.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Restore Tab */}
      {activeTab === 'restore' && (
        <>
          <div className="bg-card border rounded-lg p-6 space-y-5">
            {/* File Selection */}
            <div className="space-y-2">
              <Label htmlFor="restore-input-file">Formatted DOCX File</Label>
              <div className="flex gap-2">
                <Input
                  id="restore-input-file"
                  type="text"
                  value={restoreInputPath}
                  onChange={(e) => setRestoreInputPath(e.target.value)}
                  placeholder="Select formatted DOCX file to restore..."
                  className="flex-1"
                  disabled={isRestoring}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSelectFile('restore')}
                  disabled={isRestoring}
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Browse
                </Button>
              </div>
            </div>

            {/* Format Selection */}
            <div className="space-y-3">
              <Label>Input Format Type</Label>
              <div className="space-y-2">
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors">
                  <input
                    type="radio"
                    name="restore-format"
                    value="1"
                    checked={restoreFormatType === 1}
                    onChange={() => setRestoreFormatType(1)}
                    disabled={isRestoring}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium">Two Section Format</div>
                    <div className="text-sm text-muted-foreground">
                      Input file has Questions section followed by Answers and Explanations section
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors">
                  <input
                    type="radio"
                    name="restore-format"
                    value="2"
                    checked={restoreFormatType === 2}
                    onChange={() => setRestoreFormatType(2)}
                    disabled={isRestoring}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium">Three Section Format</div>
                    <div className="text-sm text-muted-foreground">
                      Input file has Questions, Answers, and Explanations in separate sections
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t flex gap-3">
              <Button
                onClick={handleRestore}
                disabled={isRestoring || !restoreInputPath}
                className="flex-1 sm:flex-initial"
              >
                {isRestoring ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Restoring...
                  </>
                ) : (
                  <>
                    <FileCheck className="h-4 w-4 mr-2" />
                    Restore Document
                  </>
                )}
              </Button>

              {restoreOutputPath && (
                <>
                  <Button onClick={() => handleDownload(restoreOutputPath)} variant="default" className="flex-1 sm:flex-initial">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button onClick={() => handleReset('restore')} variant="outline">
                    Reset
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Success Message */}
          {restoreOutputPath && (
            <div className="mt-6 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <FileCheck className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-medium text-green-900 dark:text-green-100">
                    Document Restored Successfully
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    Your document has been restored to single file format and is ready to download.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
