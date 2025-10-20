import React, { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card'
import { cn } from '../lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface UploadFormProps {
  open: boolean
  onClose: () => void
}

interface Option {
  id: string
  name: string
}

export default function UploadForm({ open, onClose }: UploadFormProps): React.JSX.Element {
  const [streams, setStreams] = useState<Option[]>([])
  const [streamsLoading, setStreamsLoading] = useState<boolean>(false)
  const [boards, setBoards] = useState<Option[]>([])
  const [boardsLoading, setBoardsLoading] = useState<boolean>(false)
  const [mediums, setMediums] = useState<Option[]>([])
  const [mediumsLoading, setMediumsLoading] = useState<boolean>(false)
  const [standards, setStandards] = useState<Option[]>([])
  const [standardsLoading, setStandardsLoading] = useState<boolean>(false)
  const [subjects, setSubjects] = useState<Option[]>([])
  const [subjectsLoading, setSubjectsLoading] = useState<boolean>(false)

  const [stream, setStream] = useState<string>('')
  const [board, setBoard] = useState<string>('')
  const [medium, setMedium] = useState<string>('')
  const [standard, setStandard] = useState<string>('')
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const apiBase = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'

  useEffect(() => {
    if (!open) return

    const loadInitial = async (): Promise<void> => {
      try {
        setStreamsLoading(true)
        const res1 = await fetch(`${apiBase}/streams`)
        if (res1.ok) setStreams(await res1.json())
      } catch (e) {
        console.error('fetchStreams', e)
      } finally {
        setStreamsLoading(false)
      }

      try {
        setBoardsLoading(true)
        const res2 = await fetch(`${apiBase}/boards`)
        if (res2.ok) setBoards(await res2.json())
      } catch (e) {
        console.error('fetchBoards', e)
      } finally {
        setBoardsLoading(false)
      }

      try {
        setMediumsLoading(true)
        const res3 = await fetch(`${apiBase}/mediums`)
        if (res3.ok) setMediums(await res3.json())
      } catch (e) {
        console.error('fetchMediums', e)
      } finally {
        setMediumsLoading(false)
      }
    }

    loadInitial()
  }, [open, apiBase])

  const fetchStandards = React.useCallback(
    async (streamId: string, mediumId: string): Promise<void> => {
      try {
        setStandardsLoading(true)
        const res = await fetch(`${apiBase}/standards?stream=${streamId}&medium=${mediumId}`)
        if (res.ok) setStandards(await res.json())
      } catch (e) {
        console.error('fetchStandards', e)
        setError('Failed to load standards')
      } finally {
        setStandardsLoading(false)
      }
    },
    [apiBase]
  )

  const fetchSubjects = React.useCallback(
    async (standardId: string): Promise<void> => {
      try {
        setSubjectsLoading(true)
        const res = await fetch(`${apiBase}/subjects?standard=${standardId}`)
        if (res.ok) setSubjects(await res.json())
      } catch (e) {
        console.error('fetchSubjects', e)
        setError('Failed to load subjects')
      } finally {
        setSubjectsLoading(false)
      }
    },
    [apiBase]
  )

  useEffect(() => {
    if (stream && medium) {
      fetchStandards(stream, medium)
    } else {
      setStandards([])
      setStandard('')
    }
  }, [stream, medium, fetchStandards])

  useEffect(() => {
    if (standard) {
      fetchSubjects(standard)
    } else {
      setSubjects([])
      setSelectedSubjects([])
    }
  }, [standard, fetchSubjects])

  const resetForm = (): void => {
    setStream('')
    setBoard('')
    setMedium('')
    setStandard('')
    setSelectedSubjects([])
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validate required fields
    if (!stream) {
      setError('Stream is required')
      setLoading(false)
      return
    }
    if (!medium) {
      setError('Medium is required')
      setLoading(false)
      return
    }
    if (!standard) {
      setError('Standard is required')
      setLoading(false)
      return
    }
    if (selectedSubjects.length === 0) {
      setError('Please select at least one subject')
      setLoading(false)
      return
    }

    try {
      const payload = { stream, board, medium, standard, subjects: selectedSubjects }
      const res = await fetch(`${apiBase}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        resetForm()
        onClose()
      } else {
        const data = await res.json()
        setError(data.message || 'Upload failed. Please try again.')
      }
    } catch (e) {
      console.error('submit', e)
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return <></>

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="w-[720px] max-h-[90vh] flex flex-col">
        <CardHeader>
          <CardTitle>Upload Content</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && <div className="p-4 text-sm text-red-500 bg-red-50 rounded">{error}</div>}

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-muted-foreground">Stream *</span>
                  <Select value={stream} onValueChange={setStream} disabled={streamsLoading}>
                    <SelectTrigger className="mt-2 w-full">
                      <SelectValue placeholder={streamsLoading ? 'Loading...' : 'Select stream'} />
                    </SelectTrigger>
                    <SelectContent>
                      {streams.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col">
                  <span className="text-sm font-medium text-muted-foreground">
                    Board (optional)
                  </span>
                  <Select value={board} onValueChange={setBoard} disabled={boardsLoading}>
                    <SelectTrigger className="mt-2 w-full">
                      <SelectValue placeholder={boardsLoading ? 'Loading...' : 'Any'} />
                    </SelectTrigger>
                    <SelectContent>
                      {boards.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col">
                  <span className="text-sm font-medium text-muted-foreground">Medium *</span>
                  <Select value={medium} onValueChange={setMedium} disabled={mediumsLoading}>
                    <SelectTrigger className="mt-2 w-full">
                      <SelectValue placeholder={mediumsLoading ? 'Loading...' : 'Select medium'} />
                    </SelectTrigger>
                    <SelectContent>
                      {mediums.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col">
                  <span className="text-sm font-medium text-muted-foreground">Standard *</span>
                  <Select
                    value={standard}
                    onValueChange={setStandard}
                    disabled={standardsLoading || !stream || !medium}
                  >
                    <SelectTrigger className="mt-2 w-full">
                      <SelectValue
                        placeholder={
                          standardsLoading
                            ? 'Loading...'
                            : !stream || !medium
                              ? 'Select stream and medium first'
                              : 'Select standard'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {standards.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-muted-foreground">Subjects *</span>
                  <Select
                    value={selectedSubjects[0] || ''}
                    onValueChange={(value) => {
                      setSelectedSubjects((prev) =>
                        prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]
                      )
                    }}
                    disabled={subjectsLoading || !standard}
                  >
                    <SelectTrigger className="mt-2 w-full">
                      <SelectValue
                        placeholder={
                          subjectsLoading
                            ? 'Loading...'
                            : !standard
                              ? 'Select standard first'
                              : subjects.length === 0
                                ? 'No subjects available'
                                : selectedSubjects.length === 0
                                  ? 'Select subjects'
                                  : `${selectedSubjects.length} subject(s) selected`
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                'w-2 h-2 rounded-full',
                                selectedSubjects.includes(s.id) ? 'bg-primary' : 'bg-muted'
                              )}
                            />
                            {s.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedSubjects.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedSubjects.map((subjectId) => {
                        const subject = subjects.find((s) => s.id === subjectId)
                        if (!subject) return null
                        return (
                          <div
                            key={subject.id}
                            className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
                          >
                            {subject.name}
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedSubjects((prev) => prev.filter((p) => p !== subject.id))
                              }
                              className="ml-1 text-muted-foreground hover:text-foreground"
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <CardFooter>
              <div className="flex justify-end w-full gap-2">
                <Button variant="ghost" onClick={onClose} type="button">
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Uploading...' : 'Submit'}
                </Button>
              </div>
            </CardFooter>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
