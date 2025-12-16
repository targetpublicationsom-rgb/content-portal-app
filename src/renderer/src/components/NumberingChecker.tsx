import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { FileText, Play, Loader2, FolderOpen } from 'lucide-react'
import NumberingResults from './NumberingResults'
import { numberingService } from '../services/numbering.service'
import type { NumberingValidationResult } from '../types/numbering.types'
import toast from 'react-hot-toast'

export default function NumberingChecker(): React.JSX.Element {
  const [questionsPath, setQuestionsPath] = useState('')
  const [solutionsPath, setSolutionsPath] = useState('')
  const [expectedCount, setExpectedCount] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<NumberingValidationResult | null>(null)

  const handleSelectFile = async (type: 'questions' | 'solutions'): Promise<void> => {
    try {
      const result = await window.api.dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Word Documents', extensions: ['docx'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        title: `Select ${type === 'questions' ? 'Questions' : 'Solutions'} File`
      })

      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0]
        if (type === 'questions') {
          setQuestionsPath(filePath)
        } else {
          setSolutionsPath(filePath)
        }
      }
    } catch (error) {
      console.error('Error selecting file:', error)
      toast.error('Failed to select file')
    }
  }

  const handleValidate = async (): Promise<void> => {
    if (!questionsPath || !solutionsPath) {
      toast.error('Please select both questions and solutions files')
      return
    }

    setIsValidating(true)
    setValidationResult(null)

    try {
      const expectedCountNum = expectedCount ? parseInt(expectedCount, 10) : undefined
      const result = await numberingService.validateNumbering(
        questionsPath,
        solutionsPath,
        expectedCountNum
      )

      setValidationResult(result)

      if (result.status === 'passed') {
        toast.success('Validation passed! All checks successful.')
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
    <div className="p-6 max-w-5xl mx-auto mb-5">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Content Numbering Checker
        </h1>
        <p className="text-muted-foreground mt-1">
          Validate question and solution numbering in DOCX files
        </p>
      </div>

      {/* Input Form */}
      <div className="bg-card border rounded-lg p-6 space-y-5">
        {/* Questions File */}
        <div className="space-y-2">
          <Label htmlFor="questions-file">Questions File</Label>
          <div className="flex gap-2">
            <Input
              id="questions-file"
              type="text"
              value={questionsPath}
              onChange={(e) => setQuestionsPath(e.target.value)}
              placeholder="Select questions DOCX file..."
              className="flex-1"
              disabled={isValidating}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSelectFile('questions')}
              disabled={isValidating}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Browse
            </Button>
          </div>
        </div>

        {/* Solutions File */}
        <div className="space-y-2">
          <Label htmlFor="solutions-file">Solutions File</Label>
          <div className="flex gap-2">
            <Input
              id="solutions-file"
              type="text"
              value={solutionsPath}
              onChange={(e) => setSolutionsPath(e.target.value)}
              placeholder="Select solutions DOCX file..."
              className="flex-1"
              disabled={isValidating}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSelectFile('solutions')}
              disabled={isValidating}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Browse
            </Button>
          </div>
        </div>

        {/* Expected Count */}
        <div className="space-y-2">
          <Label htmlFor="expected-count">Expected Count</Label>
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
            If specified, validation will check that both files contain exactly this many items
          </p>
        </div>

        {/* Validate Button */}
        <div className="pt-4 border-t">
          <Button
            onClick={handleValidate}
            disabled={isValidating || !questionsPath || !solutionsPath}
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
                Validate Numbering
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Results */}
      {validationResult && <NumberingResults result={validationResult} />}
    </div>
  )
}
