import { useState } from 'react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Upload, Loader2 } from 'lucide-react'
import { uploadFilesToServer } from '../services'
import toast from 'react-hot-toast'

interface UploadModalProps {
  children: React.ReactNode
}

export default function UploadModal({ children }: UploadModalProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [jobId, setJobId] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleUpload = async (): Promise<void> => {
    if (!jobId.trim()) {
      toast.error('Please enter a Job ID')
      return
    }

    setIsLoading(true)
    try {
      const result = await uploadFilesToServer(jobId.trim())
      toast.success(result.message || 'Files uploaded successfully!')
      setIsOpen(false)
      setJobId('')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenChange = (open: boolean): void => {
    setIsOpen(open)
    if (!open) {
      // Reset form when modal closes
      setJobId('')
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Upload Files to Job
          </DialogTitle>
          <DialogDescription>
            Enter the Job ID to upload additional files to an existing job.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="jobId">Job ID</Label>
            <Input
              id="jobId"
              placeholder="e.g., 01K8T0KPCHS7DTRBEJSN57W4AT"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              disabled={isLoading}
              className="font-mono text-sm"
            />
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading files to server...
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isLoading}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={isLoading || !jobId.trim()}
            className="flex-1 sm:flex-none"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}