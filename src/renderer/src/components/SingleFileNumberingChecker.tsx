import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Play, Loader2, FolderOpen } from 'lucide-react'
import SingleFileNumberingResults from './SingleFileNumberingResults'
import { numberingService } from '../services/numbering.service'
import type { SingleFileValidationResult } from '../types/numbering.types'
import toast from 'react-hot-toast'

export default function SingleFileNumberingChecker(): React.JSX.Element {
  const [filePath, setFilePath] = useState('')
  const [expectedCount, setExpectedCount] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<SingleFileValidationResult | null>(null)

  useEffect(() => {
    console.log('[SingleFileNumberingChecker] validationResult changed:', validationResult)
  }, [validationResult])

  const handleSelectFile = async (): Promise<void> => {
    try {
      const result = await window.api.dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Word Documents', extensions: ['docx'] },
          { name: 'HTML Files', extensions: ['html'] },
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        title: 'Select File to Validate'
      })

      if (!result.canceled && result.filePaths.length > 0) {
        setFilePath(result.filePaths[0])
      }
    } catch (error) {
      console.error('Error selecting file:', error)
      toast.error('Failed to select file')
    }
  }

  const handleValidate = async (): Promise<void> => {
    if (!filePath) {
      toast.error('Please select a file')
      return
    }

    setIsValidating(true)
    setValidationResult(null)

    try {
      const expectedCountNum = expectedCount ? parseInt(expectedCount, 10) : undefined
      console.log('[SingleFileNumberingChecker] Starting validation with:', {
        filePath,
        expectedCountNum
      })
      const result = await numberingService.validateSingleFile(filePath, expectedCountNum)

      console.log('[SingleFileNumberingChecker] Validation result received:', result)
      setValidationResult(result)
      console.log('[SingleFileNumberingChecker] Result state updated')

      if (result.success && result.issues.length === 0) {
        toast.success('Validation passed! All checks successful.')
      } else if (result.success && result.issues.length > 0) {
        toast.error(`Validation completed with ${result.issues.length} issue(s)`)
      } else {
        toast.error(`Validation failed with ${result.issues.length} issue(s)`)
      }
    } catch (error) {
      console.error('Validation error:', error)
      toast.error(error instanceof Error ? error.message : 'Validation failed')
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <div className="pb-6 max-w-5xl mx-auto mb-5">
      {/* Input Form */}
      <div className="bg-card border rounded-lg p-6 space-y-5">
        {/* File Input */}
        <div className="space-y-2">
          <Label htmlFor="file-path">File</Label>
          <div className="flex gap-2">
            <Input
              id="file-path"
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="Select DOCX, HTML, or TXT file..."
              className="flex-1"
              disabled={isValidating}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleSelectFile}
              disabled={isValidating}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Browse
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            File must contain delimiter lines (=====) to separate questions and solutions blocks
          </p>
        </div>

        {/* Expected Count */}
        <div className="space-y-2">
          <Label htmlFor="expected-count">Expected Count (Optional)</Label>
          <Input
            id="expected-count"
            type="number"
            value={expectedCount}
            onChange={(e) => setExpectedCount(e.target.value)}
            placeholder="Enter expected number of questions (e.g., 50)"
            min="1"
            disabled={isValidating}
          />
          <p className="text-xs text-muted-foreground">
            If specified, validation will check that the file contains exactly this many questions
          </p>
        </div>

        {/* Validate Button */}
        <div className="pt-4 border-t">
          <Button
            onClick={handleValidate}
            disabled={isValidating || !filePath}
            className="w-full sm:w-auto"
          >
            {isValidating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Validating...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Validate File
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Results */}
      {validationResult && <SingleFileNumberingResults result={validationResult} />}
    </div>
  )
}
