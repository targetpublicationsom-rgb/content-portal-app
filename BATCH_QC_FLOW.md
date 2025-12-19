# Batch QC Processing Flow Documentation

## Overview

The QC system now uses **batch processing** to submit multiple PDF files to the backend API in a single request, improving efficiency and reducing API overhead. Files are accumulated after PDF conversion, packaged into a ZIP file, and submitted as a batch using a hybrid triggering strategy.

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FILE DETECTION & QUEUEING                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  File watcher detects    │
                      │  new/modified .docx file │
                      └──────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │   enqueueJob()           │
                      │   - Create QC record     │
                      │   - Status: QUEUED       │
                      │   - Add to jobQueue      │
                      └──────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          PDF CONVERSION (Sequential)                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  processQueue()          │
                      │  MAX_CONCURRENT_JOBS = 1 │
                      │  (one at a time)         │
                      └──────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  processNewFile()        │
                      │  - Check/acquire lock    │
                      │  - Status: CONVERTING    │
                      └──────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  convertToPdf()          │
                      │  (Worker Pool: Word COM) │
                      │  - DOCX → PDF            │
                      └──────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  PDF conversion complete │
                      │  - Update pdf_path       │
                      │  - Release lock          │
                      └──────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        BATCH ACCUMULATION (Hybrid Trigger)                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  addToBatch()            │
                      │  - Add PDF to batch array│
                      │  - Start timeout timer   │
                      │    (30s on first file)   │
                      └──────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  checkBatchSubmission()  │
                      │  Triggers when:          │
                      │  1. Size ≥ 10 files      │
                      │  2. Timeout (30s)        │
                      │  3. Queue empty & ≥3     │
                      └──────────────────────────┘
                                      │
                                      ↓
                              YES (trigger met)
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  submitBatchIfReady()    │
                      │  - Clear timeout         │
                      │  - Take batch snapshot   │
                      │  - Clear batch array     │
                      └──────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         ZIP CREATION & SUBMISSION                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  submitBatch()           │
                      │  - Generate batch_id     │
                      │  - Create batch record   │
                      │    Status: PENDING       │
                      └──────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  createBatchZip()        │
                      │  ZIP structure:          │
                      │    manifest.json         │
                      │    qc-abc-001.pdf        │
                      │    qc-abc-002.pdf        │
                      │    qc-abc-003.pdf        │
                      └──────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  POST /qc/batch-process  │
                      │  - Upload ZIP file       │
                      │  - Send batch_id         │
                      └──────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  Backend Response:       │
                      │  {                       │
                      │    batch_id,             │
                      │    jobs: [               │
                      │      {qc_id, job_id},    │
                      │      ...                 │
                      │    ]                     │
                      │  }                       │
                      └──────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  updateBatchRecords()    │
                      │  - Link job_id to qc_id  │
                      │  - Set batch_id          │
                      │  - Status: PROCESSING    │
                      │  - Record history        │
                      └──────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                       POLLING & STATUS UPDATES                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  pollProcessingBatches() │
                      │  Every 5 seconds         │
                      └──────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  GET /qc/batches/{id}    │
                      │  Returns:                │
                      │  - Batch status          │
                      │  - Individual job status │
                      │  - Completed count       │
                      └──────────────────────────┘
                                      │
                                      ↓
                      ┌──────────────────────────┐
                      │  checkBatchStatus()      │
                      │  - Update batch record   │
                      │  - Distribute job status │
                      └──────────────────────────┘
                                      │
                                      ↓
                      For each job in batch:
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ↓                                   ↓
        ┌──────────────────────┐        ┌──────────────────────┐
        │  Job COMPLETED       │        │  Job FAILED          │
        │  - Save report       │        │  - Save error        │
        │  - Update issues     │        │  - Notify user       │
        │  - Notify success    │        │  - Update status     │
        └──────────────────────┘        └──────────────────────┘
                    │                                   │
                    └─────────────────┬─────────────────┘
                                      ↓
                      ┌──────────────────────────┐
                      │  Update batch status:    │
                      │  - PROCESSING            │
                      │  - PARTIAL_COMPLETE      │
                      │  - COMPLETED             │
                      │  - FAILED                │
                      └──────────────────────────┘
```

---

## Status Transitions

### File-Level Statuses

```
QUEUED          → Initial state when file is detected
    ↓
CONVERTING      → PDF conversion in progress (Word COM worker)
    ↓
[Batch Accumulation]
    ↓
PROCESSING      → Submitted to backend as part of batch
    ↓
    ├─→ COMPLETED   → QC analysis successful, report generated
    └─→ FAILED      → QC analysis failed or error occurred
```

### Batch-Level Statuses

```
PENDING         → Batch created, ZIP generation started
    ↓
SUBMITTED       → ZIP uploaded to backend, jobs queued
    ↓
PROCESSING      → Backend processing jobs in batch
    ↓
    ├─→ COMPLETED        → All jobs succeeded (100%)
    ├─→ PARTIAL_COMPLETE → Some jobs succeeded, some failed (mixed)
    └─→ FAILED           → All jobs failed (0%)
```

---

## Database Schema

### `qc_records` Table (Extended)

```sql
CREATE TABLE qc_records (
  -- Existing fields
  qc_id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  pdf_path TEXT,
  status TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  completed_at TEXT,
  report_md_path TEXT,
  report_docx_path TEXT,
  qc_score REAL,
  issues_found INTEGER,
  issues_low INTEGER,
  issues_medium INTEGER,
  issues_high INTEGER,
  external_qc_id TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  processed_by TEXT,
  folder_path TEXT,
  chapter_name TEXT,
  file_type TEXT,
  source_files TEXT,
  
  -- NEW: Batch processing fields
  batch_id TEXT,                    -- Current batch
  original_batch_id TEXT,           -- First batch (audit trail)
  batch_submission_order INTEGER,   -- Order within batch
  
  INDEX idx_batch_id (batch_id),
  INDEX idx_original_batch_id (original_batch_id)
);
```

### `qc_batches` Table (New)

```sql
CREATE TABLE qc_batches (
  batch_id TEXT PRIMARY KEY,
  zip_path TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  zip_size_bytes INTEGER,
  created_at TEXT NOT NULL,
  submitted_at TEXT,
  completed_at TEXT,
  status TEXT NOT NULL,              -- PENDING, SUBMITTED, PROCESSING, PARTIAL_COMPLETE, COMPLETED, FAILED
  completed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  processing_count INTEGER DEFAULT 0,
  
  INDEX idx_batch_status (status),
  INDEX idx_batch_submitted_at (submitted_at)
);
```

### `qc_batch_history` Table (New)

```sql
CREATE TABLE qc_batch_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qc_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  external_qc_id TEXT,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT,
  
  FOREIGN KEY (qc_id) REFERENCES qc_records(qc_id),
  INDEX idx_history_qc_id (qc_id),
  INDEX idx_history_batch_id (batch_id)
);
```

### Entity Relationship Diagram

```
┌─────────────────┐
│   qc_batches    │
│─────────────────│
│ batch_id (PK)   │◄──────┐
│ zip_path        │       │
│ file_count      │       │
│ status          │       │
│ completed_count │       │
│ failed_count    │       │
└─────────────────┘       │
                          │
                          │ batch_id (FK)
                          │
┌─────────────────────────┴─────────────┐
│           qc_records                  │
│───────────────────────────────────────│
│ qc_id (PK)                            │◄──────┐
│ file_path                             │       │
│ status                                │       │
│ batch_id (FK)                         │       │
│ original_batch_id                     │       │
│ batch_submission_order                │       │
│ external_qc_id (job_id from backend)  │       │
└───────────────────────────────────────┘       │
                                                │
                                                │ qc_id (FK)
                                                │
                          ┌─────────────────────┴───────┐
                          │    qc_batch_history         │
                          │─────────────────────────────│
                          │ id (PK)                     │
                          │ qc_id (FK)                  │
                          │ batch_id                    │
                          │ external_qc_id              │
                          │ attempt_number              │
                          │ status                      │
                          │ submitted_at                │
                          │ completed_at                │
                          │ error_message               │
                          └─────────────────────────────┘
```

---

## Batch Configuration

Default settings in `qcConfig.ts`:

```typescript
{
  batchSize: 10,              // Submit when 10 files accumulated
  batchTimeoutSeconds: 30,    // Submit after 30s if any files waiting
  minBatchSize: 3,            // Minimum files to submit on timeout/queue-empty
  maxBatchSizeMB: 150         // Maximum ZIP size in MB
}
```

### Hybrid Batching Strategy

The system submits a batch when **any** of these conditions are met:

1. **Size Trigger**: `convertedPdfBatch.length >= batchSize` (default: 10 files)
2. **Timeout Trigger**: 30 seconds elapsed since first file added to batch
3. **Queue Empty Trigger**: Job queue is empty AND batch has ≥ `minBatchSize` files (default: 3)

**Example Scenario**:
```
T+0s:  File1 converted → Added to batch, timer starts
T+2s:  File2 converted → Added to batch (2 files)
T+5s:  File3 converted → Added to batch (3 files), queue becomes empty
       → Batch submitted immediately (queue-empty trigger, >= 3 files)
```

---

## Retry Strategies

### Strategy 1: Retry Individual Failed File

User clicks "Retry" on a specific failed file in the UI.

**Flow**:
1. Clear `batch_id` and `external_qc_id` for the file
2. Reset `status` to `QUEUED`
3. Clear `error_message`
4. Re-enqueue file via `enqueueJob()`
5. File goes through conversion → batch accumulation → submission again
6. `original_batch_id` preserved for audit trail

**Database Changes**:
```sql
-- Before retry
qc_id: qc-abc-001
batch_id: batch-123
original_batch_id: batch-123
status: FAILED
retry_count: 0

-- After retry & re-submission
qc_id: qc-abc-001
batch_id: batch-456          ← New batch
original_batch_id: batch-123  ← Preserved
status: PROCESSING
retry_count: 1
```

### Strategy 2: Retry All Failed Files in Batch

User clicks "Retry Failed" at batch level.

**Flow**:
1. Query all files with `batch_id = X` and `status = FAILED`
2. Create new batch with only failed files
3. Generate new `batch_id`
4. Use existing PDFs (skip re-conversion)
5. Submit new batch to backend
6. Update records with new `batch_id` and `job_id`
7. `original_batch_id` remains unchanged

**Example**:
```javascript
// Original batch: batch-123
qc-abc-001: COMPLETED
qc-abc-002: FAILED     ← Retry
qc-abc-003: COMPLETED
qc-abc-004: FAILED     ← Retry
qc-abc-005: COMPLETED

// New batch created: batch-456 (only failed files)
qc-abc-002: batch_id = batch-456, status = PROCESSING
qc-abc-004: batch_id = batch-456, status = PROCESSING
```

---

## ZIP File Structure

### Example ZIP Contents

```
batch-abc123.zip
├── manifest.json               ← Metadata mapping qc_id → original filename
├── qc-abc-001.pdf             ← Renamed using qc_id (guaranteed unique)
├── qc-abc-002.pdf
├── qc-abc-003.pdf
├── qc-abc-004.pdf
└── qc-abc-005.pdf
```

### `manifest.json` Format

```json
{
  "batch_id": "batch-abc123",
  "submitted_at": "2025-12-03T14:30:22.000Z",
  "file_count": 5,
  "files": {
    "qc-abc-001.pdf": {
      "original_name": "Chapter1_Theory.pdf",
      "folder": "Science/01 Living World",
      "file_type": "theory"
    },
    "qc-abc-002.pdf": {
      "original_name": "Chapter1_MCQs.pdf",
      "folder": "Science/01 Living World",
      "file_type": "merged-mcqs-solution"
    },
    "qc-abc-003.pdf": {
      "original_name": "Chapter2_Theory.pdf",
      "folder": "Science/02 Biological Classification",
      "file_type": "theory"
    },
    "qc-abc-004.pdf": {
      "original_name": "Chapter1_Theory.pdf",
      "folder": "Maths/01 Sets",
      "file_type": "theory"
    },
    "qc-abc-005.pdf": {
      "original_name": "Chapter2_MCQs.pdf",
      "folder": "Maths/02 Relations",
      "file_type": "merged-mcqs-solution"
    }
  }
}
```

**Why `qc_id` as filename?**
- ✅ Guaranteed uniqueness (UUID)
- ✅ No conflicts with duplicate original filenames
- ✅ Direct mapping in backend response (`qc_id` → `job_id`)
- ✅ Simplified retry logic (can identify files in stored ZIP)

---

## Troubleshooting Guide

### Issue: Batches Not Submitting

**Symptoms**: Files converted but stuck, no batch submission

**Possible Causes**:
1. Batch size not reached and timeout not expired
2. Queue still has files being converted
3. Batch processing flag stuck

**Debug Steps**:
```javascript
// Check batch state
console.log('Batch size:', convertedPdfBatch.length)
console.log('Queue length:', jobQueue.length)
console.log('Active jobs:', activeJobs)
console.log('Is batch processing:', isBatchProcessing)

// Check timeout
console.log('Batch timeout timer:', batchTimeoutTimer ? 'active' : 'inactive')
```

**Solution**:
- Check configuration: `batchSize`, `batchTimeoutSeconds`, `minBatchSize`
- Manually trigger: Submit when queue empty with any files

---

### Issue: Files in Batch Show Different Statuses

**Symptoms**: Batch shows PROCESSING but individual files show FAILED

**Expected Behavior**: This is normal for partial completions

**Explanation**:
- Batch status = aggregate of all jobs
- Individual files have independent statuses
- `PARTIAL_COMPLETE` batch status indicates mixed results

**Query to Verify**:
```sql
SELECT 
  batch_id,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
FROM qc_records
WHERE batch_id = 'batch-abc123'
GROUP BY batch_id;
```

---

### Issue: ZIP Creation Fails

**Symptoms**: Error "Failed to create ZIP file"

**Possible Causes**:
1. PDF file not found
2. Disk space insufficient
3. Permission issues on `.qc/batches` folder

**Debug Steps**:
```javascript
// Verify PDF exists
fs.existsSync(pdfPath)

// Check disk space
const stats = fs.statSync(pdfPath)
console.log('PDF size:', stats.size)

// Check batch folder
const batchFolder = path.join(lockBasePath, '.qc', 'batches')
fs.accessSync(batchFolder, fs.constants.W_OK)
```

**Solution**:
- Ensure `.qc/batches` folder exists and is writable
- Check disk space (ZIP typically 20-50% of total PDF size)
- Verify all PDFs in batch exist before ZIP creation

---

### Issue: Backend Returns Job Mismatch

**Symptoms**: Backend returns different number of jobs than files in ZIP

**Possible Causes**:
1. Backend failed to extract some PDFs
2. Manifest file count mismatch
3. Corrupted ZIP file

**Verification**:
```javascript
// Check manifest before submission
const manifest = JSON.parse(fs.readFileSync('manifest.json'))
console.log('Manifest count:', manifest.file_count)
console.log('Actual files:', Object.keys(manifest.files).length)

// Verify ZIP integrity
const zip = new AdmZip(zipPath)
const entries = zip.getEntries()
console.log('ZIP entries:', entries.length)
```

**Solution**:
- Ensure `manifest.file_count` matches actual PDF count
- Re-create ZIP if corrupted
- Check backend logs for extraction errors

---

### Issue: Polling Not Updating Statuses

**Symptoms**: Batch status stuck on PROCESSING, no updates

**Possible Causes**:
1. Backend API not responding
2. `batch_id` mismatch
3. Polling interval stopped

**Debug Steps**:
```javascript
// Check polling status
console.log('Polling interval:', pollingInterval ? 'active' : 'inactive')

// Test API directly
const service = getQCExternalService()
const batchStatus = await service.getQCBatchStatus(batchId)
console.log('API response:', batchStatus)
```

**Solution**:
- Verify backend endpoint `GET /qc/batches/{batch_id}` is accessible
- Check `batch_id` in database matches submitted batch
- Restart polling if interval stopped: `startStatusPolling()`

---

## Performance Metrics

### Expected Timings

| Operation | Time | Notes |
|-----------|------|-------|
| PDF Conversion | 5-30s | Depends on file size, Word COM |
| Batch Accumulation | 0-30s | Up to timeout |
| ZIP Creation | 1-5s | For 10 files, ~50MB total |
| ZIP Upload | 2-10s | Depends on network |
| Backend Processing | 30s-5min | Per file, depends on complexity |
| Polling Check | 5s interval | One request per batch |

### Batch Size Optimization

**Small Batches (3-5 files)**:
- ✅ Faster feedback
- ✅ Lower memory usage
- ❌ More API calls
- ❌ More ZIP overhead

**Large Batches (15-20 files)**:
- ✅ Fewer API calls
- ✅ Better throughput
- ❌ Longer wait times
- ❌ Larger ZIP files
- ❌ Higher memory usage

**Recommended**: 10 files (default)
- Good balance between throughput and responsiveness
- ~50-100MB ZIP size
- 2-3 batches per minute in high-volume scenarios

---

## Migration Notes

### Backward Compatibility

The system maintains backward compatibility for:

1. **Existing records without `batch_id`**: Polled individually using old logic
2. **Individual submission**: `submitToExternalAPI()` still available but unused
3. **Database schema**: New columns are nullable, old records unaffected

### Migration Checklist

- [x] Database schema updated with new columns and tables
- [x] Batch configuration added to `QCConfig`
- [x] ZIP creation utility implemented
- [x] Batch accumulation logic added
- [x] API methods for batch submission created
- [x] Polling updated to handle batches
- [ ] UI updated to display batch grouping
- [ ] Frontend services updated for batch retry
- [ ] Settings UI updated with batch configuration
- [ ] Documentation completed

---

## Future Enhancements

### Potential Improvements

1. **Dynamic Batch Sizing**: Adjust batch size based on average file size
2. **Priority Batches**: Allow urgent files to bypass batch and submit immediately
3. **Batch Cancellation**: Add ability to cancel in-progress batches
4. **Webhook Support**: Backend sends completion notifications instead of polling
5. **Batch Statistics**: Track batch success rates, average processing times
6. **ZIP Compression**: Compress PDFs in ZIP to reduce upload time
7. **Retry Optimization**: Smart retry that groups failed files from multiple batches

---

**Version**: 1.0  
**Last Updated**: December 3, 2025  
**Status**: Implementation Complete (Core Features)
