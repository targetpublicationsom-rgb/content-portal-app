import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Form, FormField, FormItem, FormMessage } from './ui/form'
import api from '../lib/axios'

const formSchema = z
  .object({
    stream: z.string().min(1, 'Stream is required'),
    board: z.string().min(1, 'Board is required'),
    medium: z.string().min(1, 'Medium is required'),
    standard: z.string().min(1, 'Standard is required'),
    subject: z.string().min(1, 'Subject is required'),
    fileFormat: z.enum(['single', 'two-file']).describe('Please select a file format'),
    questionFile: z.custom<File>(
      (val) => {
        if (!(val instanceof File)) return false
        return val.name.toLowerCase().endsWith('.docx')
      },
      {
        message: 'Question file must be a .docx file'
      }
    ),
    answerFile: z
      .custom<File>((val) => {
        if (val === undefined) return true
        if (!(val instanceof File)) return false
        return val.name.toLowerCase().endsWith('.docx')
      })
      .optional()
  })
  .superRefine((data, ctx) => {
    if (data.fileFormat === 'two-file' && !data.answerFile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Answer file is required when using separate files',
        path: ['answerFile']
      })
    }
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

interface UploadFormProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function UploadForm({
  open,
  onClose,
  onSuccess
}: UploadFormProps): React.JSX.Element {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      stream: '',
      board: '',
      medium: '',
      standard: '',
      subject: '',
      fileFormat: 'single',
      questionFile: undefined,
      answerFile: undefined
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
    const resetAndLoad = async (): Promise<void> => {
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
    const fetchStandards = async (): Promise<void> => {
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

  const postJob = async (formData: FormData): Promise<void> => {
    try {
      const serverInfo = await window.api.getServerInfo()
      if (serverInfo?.port) {
        const response = await fetch(`http://127.0.0.1:${serverInfo.port}/jobs`, {
          method: 'POST',
          body: formData
        })

        if (!response.ok) {
          throw new Error('Failed to create job')
        }
      }
    } catch (error) {
      console.error('Failed to create job:', error)
      throw error
    }
  }

  const onSubmit = async (data: FormValues): Promise<void> => {
    try {
      setLoading(true)

      // Create FormData object
      const formData = new FormData()
      formData.append('format', data.fileFormat)
      formData.append('file_question', data.questionFile)
      if (data.fileFormat === 'two-file' && data.answerFile) {
        formData.append('file_answer', data.answerFile)
      }

      // Submit the job
      await postJob(formData)

      // Reset form and close dialog
      form.reset()
      onClose()
      // Trigger refresh of jobs list
      onSuccess?.()
    } catch (e) {
      console.error('submit', e)
      setErrors((prev) => ({ ...prev, networkError: true }))
    } finally {
      setLoading(false)
    }
  }

  if (!open) return <></>

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[5vh]">
      <Card className="w-[720px] max-h-[90vh] flex flex-col">
        <CardHeader>
          <CardTitle>Upload Content</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          <Form {...form}>
            <form id="uploadForm" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {errors.networkError && (
                <div className="p-4 text-sm text-red-500 bg-red-50 rounded">
                  Network error. Please check your connection and try again.
                </div>
              )}
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="stream"
                    render={({ field }) => (
                      <FormItem className="flex flex-col space-y-1.5">
                        <span className="text-sm font-medium text-muted-foreground">Stream *</span>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={streamsLoading}
                        >
                          <SelectTrigger className="w-full h-10">
                            <SelectValue
                              placeholder={streamsLoading ? 'Loading...' : 'Select stream'}
                            />
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
                      <FormItem className="flex flex-col space-y-1.5">
                        <span className="text-sm font-medium text-muted-foreground">Board *</span>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={boardsLoading}
                        >
                          <SelectTrigger className="w-full h-10">
                            <SelectValue
                              placeholder={boardsLoading ? 'Loading...' : 'Select board'}
                            />
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
                      <FormItem className="flex flex-col space-y-1.5">
                        <span className="text-sm font-medium text-muted-foreground">Medium *</span>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={mediumsLoading}
                        >
                          <SelectTrigger className="w-full h-10">
                            <SelectValue
                              placeholder={mediumsLoading ? 'Loading...' : 'Select medium'}
                            />
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
                      <FormItem className="flex flex-col space-y-1.5">
                        <span className="text-sm font-medium text-muted-foreground">
                          Standard *
                        </span>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={
                            standardsLoading ||
                            !form.getValues('stream') ||
                            !form.getValues('medium')
                          }
                        >
                          <SelectTrigger className="w-full h-10">
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
                      <FormItem className="flex flex-col space-y-1.5">
                        <span className="text-sm font-medium text-muted-foreground">Subject *</span>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={subjectsLoading || !form.getValues('standard')}
                        >
                          <SelectTrigger className="w-full h-10">
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

                <FormField
                  name="fileFormat"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <span className="text-sm font-medium text-muted-foreground">
                        Upload Format *
                      </span>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="single"
                            value="single"
                            className="h-4 w-4"
                            checked={field.value === 'single'}
                            onChange={() => field.onChange('single')}
                          />
                          <label
                            htmlFor="single"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Single File
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="two-file"
                            value="two-file"
                            className="h-4 w-4"
                            checked={field.value === 'two-file'}
                            onChange={() => field.onChange('two-file')}
                          />
                          <label
                            htmlFor="two-file"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Separate Files
                          </label>
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-col gap-x-4 gap-y-6">
                  <FormField
                    name="questionFile"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem className="flex flex-col space-y-1.5">
                        <span className="text-sm font-medium text-muted-foreground">
                          Question File *
                        </span>
                        <input
                          type="file"
                          accept=".docx"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file && !file.name.toLowerCase().endsWith('.docx')) {
                              return // Don't set invalid file
                            }
                            field.onChange(file)
                          }}
                          className="block w-full h-10 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch('fileFormat') === 'two-file' && (
                    <FormField
                      name="answerFile"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem className="flex flex-col space-y-1.5">
                          <span className="text-sm font-medium text-muted-foreground">
                            Answer File *
                          </span>
                          <input
                            type="file"
                            accept=".docx"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file && !file.name.toLowerCase().endsWith('.docx')) {
                                return // Don't set invalid file
                              }
                              field.onChange(file)
                            }}
                            className="block w-full h-10 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
        <CardFooter>
          <div className="flex justify-end w-full gap-2">
            <Button variant="ghost" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button form="uploadForm" type="submit" disabled={loading}>
              {loading ? 'Uploading...' : 'Submit'}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
