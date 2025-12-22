import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { FileType, Loader2, FolderOpen, Download, FileCheck } from 'lucide-react'
import toast from 'react-hot-toast'

type FormatType = 1 | 2

export default function DocsFormatter(): React.JSX.Element {
  const [inputPath, setInputPath] = useState('')
  const [formatType, setFormatType] = useState<FormatType>(1)
  const [isFormatting, setIsFormatting] = useState(false)
  const [outputPath, setOutputPath] = useState<string | null>(null)

  const handleSelectFile = async (): Promise<void> => {
    try {
      const result = await window.api.dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Word Documents', extensions: ['docx'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        title: 'Select DOCX File to Format'
      })

      if (!result.canceled && result.filePaths.length > 0) {
        setInputPath(result.filePaths[0])
        setOutputPath(null) // Clear previous output
      }
    } catch (error) {
      console.error('Error selecting file:', error)
      toast.error('Failed to select file')
    }
  }

  const handleFormat = async (): Promise<void> => {
    if (!inputPath) {
      toast.error('Please select a DOCX file')
      return
    }

    setIsFormatting(true)
    setOutputPath(null)

    try {
      const result = await window.api.docsFormatter.format(inputPath, formatType)

      if (result.success && result.outputPath) {
        setOutputPath(result.outputPath)
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

  const handleDownload = async (): Promise<void> => {
    if (!outputPath) return

    try {
      const result = await window.api.dialog.showSaveDialog({
        defaultPath: outputPath.split('\\').pop() || 'formatted_document.docx',
        filters: [{ name: 'Word Documents', extensions: ['docx'] }],
        title: 'Save Formatted Document'
      })

      if (!result.canceled && result.filePath) {
        // Copy the temp file to the selected location
        const copyResult = await window.api.file.copy(outputPath, result.filePath)
        
        if (copyResult.success) {
          toast.success('File saved successfully!')
          // Open the folder containing the saved file
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

  const handleReset = (): void => {
    setInputPath('')
    setOutputPath(null)
    setFormatType(1)
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
          Format DOCX files containing questions, options, answers, and explanations
        </p>
      </div>

      {/* Input Form */}
      <div className="bg-card border rounded-lg p-6 space-y-5">
        {/* File Selection */}
        <div className="space-y-2">
          <Label htmlFor="input-file">Input DOCX File</Label>
          <div className="flex gap-2">
            <Input
              id="input-file"
              type="text"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              placeholder="Select DOCX file to format..."
              className="flex-1"
              disabled={isFormatting}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleSelectFile}
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
            disabled={isFormatting || !inputPath}
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

          {outputPath && (
            <>
              <Button onClick={handleDownload} variant="default" className="flex-1 sm:flex-initial">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button onClick={handleReset} variant="outline">
                Reset
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Success Message */}
      {outputPath && (
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
    </div>
  )
}
