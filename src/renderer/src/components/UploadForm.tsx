import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Form, FormField, FormItem, FormMessage } from './ui/form'
import { Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTaxonomyData } from '../hooks'
import { createJob } from '../services'

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
  onSuccess?: (jobId: string) => void
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

  // Use the custom hook for taxonomy data
  const {
    streams,
    boards,
    mediums,
    standards,
    subjects,
    loadingOptions,
    loadStandards,
    loadSubjects
  } = useTaxonomyData()

  const [loading, setLoading] = useState(false)
  const [, setErrors] = useState<Record<string, boolean>>({
    stream: false,
    medium: false,
    standard: false,
    subject: false,
    networkError: false
  })

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset()
      setErrors({
        stream: false,
        medium: false,
        standard: false,
        subject: false,
        networkError: false
      })
    }
  }, [open, form])

  // Watch form values for standards
  const streamValue = form.watch('stream')
  const mediumValue = form.watch('medium')
  const boardValue = form.watch('board')

  useEffect(() => {
    if (streamValue && mediumValue && boardValue) {
      loadStandards(streamValue, boardValue, mediumValue)
    }
  }, [streamValue, mediumValue, boardValue, loadStandards])

  // Watch form value for subjects
  const standardValue = form.watch('standard')

  useEffect(() => {
    if (standardValue) {
      loadSubjects(standardValue)
    }
  }, [standardValue, loadSubjects])

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

      // Add taxonomy fields
      // Stream
      formData.append('stream_id', data.stream)
      const selectedStream = streams.find((s) => s.id == data.stream)
      formData.append('stream_name', selectedStream?.name || '')

      // Standard
      formData.append('standard_id', data.standard)
      const selectedStandard = standards.find((s) => s.id == data.standard)
      formData.append('standard_name', selectedStandard?.name || '')

      // Subject
      formData.append('subject_id', data.subject)
      const selectedSubject = subjects.find((s) => s.id == data.subject)
      formData.append('subject_name', selectedSubject?.name || '')

      // Submit the job using the service
      const response = await createJob(formData)

      toast.success('Job created successfully!')

      // Reset form and close dialog
      form.reset()
      onClose()

      // Trigger refresh of jobs list
      if (response.job_id) {
        onSuccess?.(response.job_id)
      }
    } catch (e: any) {
      console.error('submit', e)
      toast.error(e.message)
      setErrors((prev) => ({ ...prev, networkError: true }))
    } finally {
      setLoading(false)
    }
  }

  if (!open) return <></>

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm pt-[5vh]">
      <Card className="w-[720px] max-h-[90vh] flex flex-col bg-card border-2 shadow-2xl rounded-xl">
        <CardHeader className="pb-4 bg-gradient-to-r from-card to-card/80 border-b rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-2xl font-bold text-foreground">Upload Content</CardTitle>
            </div>
            <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Upload className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          <Form {...form}>
            <form id="uploadForm" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                          disabled={loadingOptions.streams}
                        >
                          <SelectTrigger className="w-full h-10">
                            <SelectValue
                              placeholder={loadingOptions.streams ? 'Loading...' : 'Select stream'}
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
                          disabled={loadingOptions.boards}
                        >
                          <SelectTrigger className="w-full h-10">
                            <SelectValue
                              placeholder={loadingOptions.boards ? 'Loading...' : 'Select board'}
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
                          disabled={loadingOptions.mediums}
                        >
                          <SelectTrigger className="w-full h-10">
                            <SelectValue
                              placeholder={loadingOptions.mediums ? 'Loading...' : 'Select medium'}
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
                            loadingOptions.standards ||
                            !form.getValues('stream') ||
                            !form.getValues('medium')
                          }
                        >
                          <SelectTrigger className="w-full h-10">
                            <SelectValue
                              placeholder={
                                loadingOptions.standards
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
                          disabled={loadingOptions.subjects || !form.getValues('standard')}
                        >
                          <SelectTrigger className="w-full h-10">
                            <SelectValue
                              placeholder={
                                loadingOptions.subjects
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
