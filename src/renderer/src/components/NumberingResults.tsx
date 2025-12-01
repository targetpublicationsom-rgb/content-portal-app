import type { NumberingValidationResult } from '../types/numbering.types'
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

interface NumberingResultsProps {
    result: NumberingValidationResult
}

export default function NumberingResults({ result }: NumberingResultsProps): React.JSX.Element {
    const isPassed = result.status === 'passed'

    return (
        <div className="mt-6 space-y-4">
            {/* Status Header */}
            <div
                className={`flex items-center gap-3 p-4 rounded-lg border-2 ${isPassed
                        ? 'bg-green-50 border-green-500 text-green-800'
                        : 'bg-red-50 border-red-500 text-red-800'
                    }`}
            >
                {isPassed ? (
                    <CheckCircle2 className="h-6 w-6 flex-shrink-0" />
                ) : (
                    <XCircle className="h-6 w-6 flex-shrink-0" />
                )}
                <div>
                    <h3 className="font-bold text-lg">
                        {isPassed ? 'All Validation Checks Passed!' : 'Validation Failed'}
                    </h3>
                    <p className="text-sm opacity-90">
                        {isPassed
                            ? 'All questions and solutions are numbered correctly.'
                            : `${result.issues.length} issue${result.issues.length !== 1 ? 's' : ''} found`}
                    </p>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4">
                {/* Questions Summary */}
                <div className="bg-card border rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Questions</h4>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center">
                            <span className="text-sm">Count:</span>
                            <span
                                className={`font-bold ${result.summary.questions.count === result.summary.questions.expected
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                    }`}
                            >
                                {result.summary.questions.count} / {result.summary.questions.expected}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm">Numbers Found:</span>
                            <span className="font-medium">{result.details.questions.numbers}</span>
                        </div>
                    </div>
                </div>

                {/* Solutions Summary */}
                <div className="bg-card border rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Solutions</h4>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center">
                            <span className="text-sm">Count:</span>
                            <span
                                className={`font-bold ${result.summary.solutions.count === result.summary.solutions.expected
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                    }`}
                            >
                                {result.summary.solutions.count} / {result.summary.solutions.expected}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm">Numbers Found:</span>
                            <span className="font-medium">{result.details.solutions.numbers}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Issues List */}
            {result.issues.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                    <div className="flex items-start gap-2 mb-3">
                        <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
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
