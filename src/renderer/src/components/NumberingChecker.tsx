import { useState } from 'react'
import { FileText } from 'lucide-react'
import TwoFileNumberingChecker from './TwoFileNumberingChecker'
import SingleFileNumberingChecker from './SingleFileNumberingChecker'

type CheckerFormat = 'two-file' | 'single-file'

export default function NumberingChecker(): React.JSX.Element {
  const [activeFormat, setActiveFormat] = useState<CheckerFormat>('two-file')

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

      {/* Format Selection Tabs */}
      <div className="bg-card border rounded-lg p-1 mb-6 inline-flex gap-1">
        <button
          onClick={() => setActiveFormat('two-file')}
          className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
            activeFormat === 'two-file'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Two-File Format
        </button>
        <button
          onClick={() => setActiveFormat('single-file')}
          className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
            activeFormat === 'single-file'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Single-File Format
        </button>
      </div>

      {/* Format Information */}
      <div className="bg-muted/30 border rounded-lg p-4 mb-6 text-sm">
        {activeFormat === 'two-file' ? (
          <p>
            <strong>Two-File Format:</strong> Validates question and solution numbering in separate
            DOCX files. Use this format when your questions and solutions are in different files.
          </p>
        ) : (
          <p>
            <strong>Single-File Format:</strong> Validates question and solution numbering in a
            single DOCX/HTML/TXT file with delimiter-separated blocks (====). Use this format when
            questions and solutions are in the same file.
          </p>
        )}
      </div>

      {/* Component Rendering */}
      {activeFormat === 'two-file' ? <TwoFileNumberingChecker /> : <SingleFileNumberingChecker />}
    </div>
  )
}

