import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Form, FormField, FormItem, FormMessage } from './ui/form'
import api from '../lib/axios'

const formSchema = z.object({
  stream: z.string().min(1, 'Stream is required'),
  board: z.string().optional(),
  medium: z.string().min(1, 'Medium is required'),
  standard: z.string().min(1, 'Standard is required'),
  subject: z.string().min(1, 'Subject is required')
})

type FormValues = z.infer<typeof formSchema>

interface UploadFormProps {
  open: boolean
  onClose: () => void
}

interface Option {
  id: string
  name: string
}

export default function UploadForm({ open, onClose }: UploadFormProps): React.JSX.Element {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      stream: '',
      board: '',
      medium: '',
      standard: '',
      subject: ''
    }
  })
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

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, boolean>>({
    stream: false,
    medium: false,
    standard: false,
    subject: false,
    networkError: false
  })
  useEffect(() => {
    const resetAndLoad = async () => {
      if (!open) {
        form.reset()
        setErrors({
          stream: false,
          medium: false,
          standard: false,
          subject: false,
          networkError: false
        })
        return
      }

      try {
        setStreamsLoading(true)
        const { data: streamsData } = await api.get('/streams')
        setStreams(streamsData?.data)
      } catch (e) {
        console.error('fetchStreams', e)
        setErrors((prev) => ({ ...prev, networkError: true }))
      } finally {
        setStreamsLoading(false)
      }

      try {
        setBoardsLoading(true)
        const { data: boardsData } = await api.get('/boards')
        setBoards(boardsData?.data)
      } catch (e) {
        console.error('fetchBoards', e)
        setErrors((prev) => ({ ...prev, networkError: true }))
      } finally {
        setBoardsLoading(false)
      }

      try {
        setMediumsLoading(true)
        const { data: mediumsData } = await api.get('/mediums')
        setMediums(mediumsData?.data)
      } catch (e) {
        console.error('fetchMediums', e)
        setErrors((prev) => ({ ...prev, networkError: true }))
      } finally {
        setMediumsLoading(false)
      }
    }

    resetAndLoad()
  }, [open, form])

  // Watch form values for standards
  const streamValue = form.watch('stream')
  const mediumValue = form.watch('medium')
  const boardValue = form.watch('board')

  useEffect(() => {
    const fetchStandards = async () => {
      if (streamValue && mediumValue) {
        setStandardsLoading(true)
        try {
          const { data: standardsData } = await api.get<{ data: Option[] }>('/standards', {
            params: {
              stream_id: streamValue,
              medium_id: mediumValue,
              board_id: boardValue
            }
          })
          setStandards(standardsData.data)
        } catch {
          setErrors((prev) => ({ ...prev, networkError: true }))
        } finally {
          setStandardsLoading(false)
        }
      } else {
        setStandards([])
        form.setValue('standard', '')
        form.setValue('subject', '')
      }
    }

    fetchStandards()
  }, [streamValue, mediumValue, boardValue, form])

  // Watch form value for subjects
  const standardValue = form.watch('standard')

  useEffect(() => {
    const fetchSubjects = async (): Promise<void> => {
      if (standardValue) {
        setSubjectsLoading(true)
        try {
          const { data: subjectsData } = await api.get<{ data: Option[] }>('/subjects', {
            params: { standard_metadata_id: standardValue }
          })
          setSubjects(subjectsData.data)
        } catch {
          setErrors((prev) => ({ ...prev, networkError: true }))
        } finally {
          setSubjectsLoading(false)
        }
      } else {
        setSubjects([])
        form.setValue('subject', '')
      }
    }

    fetchSubjects()
  }, [standardValue, form])

  const onSubmit = async (data: FormValues): Promise<void> => {
    try {
      setLoading(true)
      await api.post('/upload', data)
      form.reset()
      onClose()
    } catch (e) {
      console.error('submit', e)
      setErrors(prev => ({ ...prev, networkError: true }))
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
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {errors.networkError && (
                <div className="p-4 text-sm text-red-500 bg-red-50 rounded">
                  Network error. Please check your connection and try again.
                </div>
              )}
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                  <FormField
                    control={form.control}
                    name="stream"
                    render={({ field }) => (
                      <FormItem>
                        <span className="text-sm font-medium text-muted-foreground">Stream *</span>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={streamsLoading}
                        >
                          <SelectTrigger className="mt-2 w-full">
                            <SelectValue placeholder={streamsLoading ? 'Loading...' : 'Select stream'} />
                          </SelectTrigger>
                          <SelectContent>
                            {streams.map((s) => (
                              <SelectItem key={s.id} value={String(s.id)}>
                                {s?.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="board"
                    render={({ field }) => (
                      <FormItem>
                        <span className="text-sm font-medium text-muted-foreground">
                          Board (optional)
                        </span>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={boardsLoading}
                        >
                          <SelectTrigger className="mt-2 w-full">
                            <SelectValue placeholder={boardsLoading ? 'Loading...' : 'Any'} />
                          </SelectTrigger>
                          <SelectContent>
                            {boards.map((b) => (
                              <SelectItem key={b.id} value={String(b.id)}>
                                {b.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="medium"
                    render={({ field }) => (
                      <FormItem>
                        <span className="text-sm font-medium text-muted-foreground">Medium *</span>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={mediumsLoading}
                        >
                          <SelectTrigger className="mt-2 w-full">
                            <SelectValue placeholder={mediumsLoading ? 'Loading...' : 'Select medium'} />
                          </SelectTrigger>
                          <SelectContent>
                            {mediums.map((m) => (
                              <SelectItem key={m.id} value={String(m.id)}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="standard"
                    render={({ field }) => (
                      <FormItem>
                        <span className="text-sm font-medium text-muted-foreground">Standard *</span>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={standardsLoading || !form.getValues('stream') || !form.getValues('medium')}
                        >
                          <SelectTrigger className="mt-2 w-full">
                            <SelectValue
                              placeholder={
                                standardsLoading
                                  ? 'Loading...'
                                  : !form.getValues('stream') || !form.getValues('medium')
                                    ? 'Select stream and medium first'
                                    : 'Select standard'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {standards.map((s) => (
                              <SelectItem key={s.id} value={String(s.id)}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <span className="text-sm font-medium text-muted-foreground">Subject *</span>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={subjectsLoading || !form.getValues('standard')}
                        >
                          <SelectTrigger className="mt-2 w-full">
                            <SelectValue
                              placeholder={
                                subjectsLoading
                                  ? 'Loading...'
                                  : !form.getValues('standard')
                                    ? 'Select standard first'
                                    : subjects.length === 0
                                      ? 'No subjects available'
                                      : 'Select subject'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {subjects.map((s) => (
                              <SelectItem key={s.id} value={String(s.id)}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
