import React, { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import api from '../lib/axios'

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
  const [subject, setSubject] = useState<string>('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  useEffect(() => {
    if (!open) return

    const loadInitial = async (): Promise<void> => {
      try {
        setStreamsLoading(true)
        const { data: streamsData } = await api.get('/streams')
        setStreams(streamsData?.data)
      } catch (e) {
        console.error('fetchStreams', e)
      } finally {
        setStreamsLoading(false)
      }

      try {
        setBoardsLoading(true)
        const { data: boardsData } = await api.get('/boards')
        setBoards(boardsData?.data)
      } catch (e) {
        console.error('fetchBoards', e)
      } finally {
        setBoardsLoading(false)
      }

      try {
        setMediumsLoading(true)
        const { data: mediumsData } = await api.get('/mediums')
        setMediums(mediumsData?.data)
      } catch (e) {
        console.error('fetchMediums', e)
      } finally {
        setMediumsLoading(false)
      }
    }

    loadInitial()
  }, [open])

  const fetchStandards = React.useCallback(async (): Promise<void> => {
    try {
      setStandardsLoading(true)
      const { data: standardsData } = await api.get('/standards', {
        params: { stream_id: stream, medium_id: medium, board_id: board }
      })

      setStandards(standardsData?.data)
    } catch (e) {
      console.error('fetchStandards', e)
      setError('Failed to load standards')
    } finally {
      setStandardsLoading(false)
    }
  }, [board, medium, stream])

  const fetchSubjects = React.useCallback(async (): Promise<void> => {
    try {
      setSubjectsLoading(true)
      const { data: subjectsData } = await api.get('/subjects', {
        params: { standard_metadata_id: standard }
      })
      setSubjects(subjectsData?.data)
    } catch (e) {
      console.error('fetchSubjects', e)
      setError('Failed to load subjects')
    } finally {
      setSubjectsLoading(false)
    }
  }, [standard])

  useEffect(() => {
    if (stream && medium) {
      fetchStandards()
    } else {
      setStandards([])
      setStandard('')
    }
  }, [stream, medium, fetchStandards])

  useEffect(() => {
    if (standard) {
      fetchSubjects()
    } else {
      setSubjects([])
      setSubject('')
    }
  }, [standard, fetchSubjects])

  const resetForm = (): void => {
    setStream('')
    setBoard('')
    setMedium('')
    setStandard('')
    setSubject('')
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
    if (!subject) {
      setError('Please select a subject')
      setLoading(false)
      return
    }

    try {
      const payload = { stream, board, medium, standard, subject }
      await api.post('/upload', payload)
      resetForm()
      onClose()
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
                  <span className="text-sm font-medium text-muted-foreground">Subject *</span>
                  <Select
                    value={subject}
                    onValueChange={setSubject}
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
                                : 'Select subject'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
