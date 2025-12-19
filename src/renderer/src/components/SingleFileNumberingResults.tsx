import type { SingleFileValidationResult } from '../types/numbering.types'
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

interface SingleFileNumberingResultsProps {
  result: SingleFileValidationResult
}

export default function SingleFileNumberingResults({
  result
}: SingleFileNumberingResultsProps): React.JSX.Element {
  const isValid = result.success && result.issues.length === 0
  const hasIssues = result.issues.length > 0

  return (
    <div className="mt-6 space-y-4">
      {/* Status Header */}
      <div
        className={`flex items-center gap-3 p-4 rounded-lg border-2 ${
          isValid
            ? 'bg-green-50 border-green-500 text-green-800'
            : hasIssues && result.success
              ? 'bg-amber-50 border-amber-500 text-amber-800'
              : 'bg-red-50 border-red-500 text-red-800'
        }`}
      >
        {isValid ? (
          <CheckCircle2 className="h-6 w-6 shrink-0" />
        ) : hasIssues && result.success ? (
          <AlertCircle className="h-6 w-6 shrink-0" />
        ) : (
          <XCircle className="h-6 w-6 shrink-0" />
        )}
        <div>
          <h3 className="font-bold text-lg">
            {isValid
              ? 'Validation Passed!'
              : hasIssues && result.success
                ? 'Validation Completed with Issues'
                : 'Validation Failed'}
          </h3>
          <p className="text-sm opacity-90">
            {isValid
              ? 'File structure and numbering are correct.'
              : `${result.issues.length} issue${result.issues.length !== 1 ? 's' : ''} found`}
          </p>
        </div>
      </div>

      {/* File Structure Info + Summary Cards in one line */}
      <div className="grid grid-cols-3 gap-4">
        {/* Blocks Found */}
        <div className="bg-card border rounded-lg p-4">
          <h4 className="text-sm font-semibold text-muted-foreground mb-3">Blocks Found</h4>
          <p className="text-lg font-bold text-foreground">{result.blocks_found}</p>
          {result.blocks_found === 1 && (
            <p className="text-xs text-muted-foreground mt-2">
              Single block - questions only
            </p>
          )}
        </div>
        {/* Questions Summary */}
        <div className="bg-card border rounded-lg p-4">
          <h4 className="text-sm font-semibold text-muted-foreground mb-3">Questions</h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm">Count:</span>
              <span className="font-bold text-lg">{result.questions.count}</span>
            </div>
            {result.questions.numbers.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">Numbers:</span>
                <p className="text-xs font-mono mt-1 truncate">
                  {result.questions.numbers.slice(0, 10).join(', ')}
                  {result.questions.numbers.length > 10 && '...'}
                </p>
              </div>
            )}
            {result.expected_count && result.expected_count > 0 && (
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm">Expected:</span>
                <span
                  className={`font-semibold ${
                    result.questions.count === result.expected_count
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {result.expected_count}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Solutions Summary */}
        <div className="bg-card border rounded-lg p-4">
          <h4 className="text-sm font-semibold text-muted-foreground mb-3">Solutions</h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm">Count:</span>
              <span className="font-bold text-lg">{result.solutions.count}</span>
            </div>
            {result.solutions.numbers.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">Numbers:</span>
                <p className="text-xs font-mono mt-1 truncate">
                  {result.solutions.numbers.slice(0, 10).join(', ')}
                  {result.solutions.numbers.length > 10 && '...'}
                </p>
              </div>
            )}
            {result.blocks_found === 1 && (
              <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                Not applicable for single-block files
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Issues List */}
      {hasIssues && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <h4 className="font-semibold text-amber-900">Issues Detected</h4>
          </div>
          <ul className="space-y-2 ml-7">
            {result.issues.map((issue, index) => (
              <li key={index} className="text-sm text-amber-800">
                • {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
