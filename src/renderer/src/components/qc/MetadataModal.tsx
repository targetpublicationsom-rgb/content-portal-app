import { useState, useEffect } from 'react'
import { metadataService, type Standard, type Subject, type Chapter } from '../../services/metadata.service'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Label } from '../ui/label'
import { Loader2 } from 'lucide-react'

interface MetadataModalProps {
  isOpen: boolean
  qcId: string
  filename: string
  chapterName?: string
  onSubmit: (metadata: { standard: string; subject: string; chapter: string }) => void
  onCancel: (qcId: string) => void
}

export default function MetadataModal({
  isOpen,
  qcId,
  filename,
  chapterName,
  onSubmit,
  onCancel
}: MetadataModalProps) {
  const [standards, setStandards] = useState<Standard[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])

  const [selectedStandard, setSelectedStandard] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedChapter, setSelectedChapter] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch standards on mount
  useEffect(() => {
    if (isOpen) {
      loadStandards()
    }
  }, [isOpen])

  const loadStandards = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await metadataService.getStandards()
      setStandards(data)
    } catch (err) {
      setError('Failed to load standards. Please check your API configuration.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleStandardChange = async (standardId: string) => {
    setSelectedStandard(standardId)
    setSelectedSubject('')
    setSelectedChapter('')
    setSubjects([])
    setChapters([])

    if (!standardId) return

    setLoading(true)
    setError(null)
    try {
      const data = await metadataService.getSubjects(standardId)
      setSubjects(data)
    } catch (err) {
      setError('Failed to load subjects')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubjectChange = async (subjectId: string) => {
    setSelectedSubject(subjectId)
    setSelectedChapter('')
    setChapters([])

    if (!subjectId) return

    setLoading(true)
    setError(null)
    try {
      const data = await metadataService.getChapters(subjectId)
      setChapters(data)
    } catch (err) {
      setError('Failed to load chapters')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = () => {
    if (!selectedStandard || !selectedSubject || !selectedChapter) {
      setError('All fields are required')
      return
    }

    const standardName = standards.find((s) => s.id === selectedStandard)?.name || ''
    const subjectName = subjects.find((s) => s.id === selectedSubject)?.name || ''
    const chapterName = chapters.find((c) => c.id === selectedChapter)?.name || ''

    onSubmit({
      standard: standardName,
      subject: subjectName,
      chapter: chapterName
    })
  }

  const handleCancel = () => {
    // Just close the modal, keep the file in PENDING_METADATA state
    onCancel(qcId)
  }

  const isSubmitDisabled = !selectedStandard || !selectedSubject || !selectedChapter || loading

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()} >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Metadata for Subjective File</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto overflow-x-visible">
          {/* File Info */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              <strong>File:</strong> {filename}
            </p>
            {chapterName && (
              <p className="text-sm text-muted-foreground">
                <strong>Chapter:</strong> {chapterName}
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Standard Dropdown */}
          <div className="space-y-2">
            <Label htmlFor="standard">
              Standard <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedStandard}
              onValueChange={handleStandardChange}
              disabled={loading || standards.length === 0}
            >
              <SelectTrigger id="standard" className="w-full">
                <SelectValue placeholder="Select Standard" />
              </SelectTrigger>
              <SelectContent sideOffset={5} collisionPadding={20} className="max-h-[300px]">
                {standards.map((standard) => (
                  <SelectItem key={standard.id} value={standard.id}>
                    {standard.name_alias}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject Dropdown */}
          <div className="space-y-2">
            <Label htmlFor="subject">
              Subject <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedSubject}
              onValueChange={handleSubjectChange}
              disabled={loading || !selectedStandard || subjects.length === 0}
            >
              <SelectTrigger id="subject" className="w-full">
                <SelectValue placeholder="Select Subject" />
              </SelectTrigger>
              <SelectContent sideOffset={5} collisionPadding={20} className="max-h-[300px]">
                {subjects.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id}>
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Chapter Dropdown */}
          <div className="space-y-2">
            <Label htmlFor="chapter">
              Chapter <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedChapter}
              onValueChange={setSelectedChapter}
              disabled={loading || !selectedSubject || chapters.length === 0}
            >
              <SelectTrigger id="chapter" className="w-full">
                <SelectValue placeholder="Select Chapter" />
              </SelectTrigger>
              <SelectContent sideOffset={5} collisionPadding={20} className="max-h-[300px]">
                {chapters.map((chapter) => (
                  <SelectItem key={chapter.id} value={chapter.id}>
                    {chapter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Metadata is required to continue processing this file
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitDisabled}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
