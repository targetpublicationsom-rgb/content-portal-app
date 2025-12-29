# Backend Batch API Specification

## Overview

This document specifies the required backend API endpoints for batch QC processing. The frontend application will submit multiple PDF files in a single ZIP file, and the backend must extract, process, and track individual job statuses within the batch.

---

## Supported File Types

The QC system supports the following content file types in the manifest metadata. The `file_type` field helps backends apply type-specific processing or categorization.

| File Type | Description | Format | Processing |
|-----------|-------------|--------|------------|
| `theory` | Theoretical content or textbook chapters | Single file | Standard QC analysis |
| `mcqs-solution` | Multiple-choice questions with answers combined | Single or merged file | Standard QC analysis |
| `merged-mcqs-solution` | MCQs and Solutions merged from separate files | Merged file | Standard QC analysis (numbering pre-validated) |
| `single-file` | Files outside folder structure, treated as standalone | Single file | Standard QC analysis |
| `subjective` | Essays, assignments, or subjective content | Single file | Standard QC analysis |
| `null` | File type unknown or not classified | Any | Standard QC analysis |

**Notes:**
- `file_type` is metadata for classification only—it does not change QC processing logic
- Backends may use `file_type` for categorizing results, reporting, or analytics
- `null` values indicate type detection failed; backend should still process the file
- All types are converted to PDF before submission and require identical QC processing

---

## Required Endpoints

### 1. Submit Batch for Processing

**Endpoint**: `POST /qc/batch-process`

**Description**: Accepts a ZIP file containing multiple PDFs with a manifest file. Backend extracts PDFs, creates individual jobs, and returns mappings.

#### Request

**Method**: `POST`  
**Content-Type**: `multipart/form-data`  
**Timeout**: 5 minutes (300 seconds)

**Form Data Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | File (ZIP) | Yes | ZIP file containing PDFs and manifest.json |
| `batch_id` | String | No | Client-generated batch ID (UUID) for tracking |

**ZIP File Structure**:

```
batch-{batch_id}.zip
├── manifest.json              ← Required metadata file
├── qc-abc-001.pdf            ← PDFs renamed with qc_id
├── qc-abc-002.pdf
├── qc-abc-003.pdf
├── qc-abc-004.pdf
└── qc-abc-005.pdf
```

**`manifest.json` Schema**:

```json
{
  "batch_id": "string (UUID)",
  "submitted_at": "string (ISO 8601 datetime)",
  "file_count": "integer",
  "files": {
    "{qc_id}.pdf": {
      "original_name": "string",
      "folder": "string | null",
      "file_type": "string | null"
    }
  }
}
```

**Example `manifest.json`**:

```json
{
  "batch_id": "batch-abc123",
  "submitted_at": "2025-12-03T14:30:22.000Z",
  "file_count": 6,
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
      "file_type": "mcqs-solution"
    },
    "qc-abc-006.pdf": {
      "original_name": "Chapter1_Essay.pdf",
      "folder": "Essays/01 Introduction",
      "file_type": "subjective"
    }
  }
}
```

#### Response (Success - 201 Created)

**HTTP Status**: `201 Created`  
**Content-Type**: `application/json`

**Schema**:

```typescript
{
  success: boolean
  batch_id: string
  status: "SUBMITTED"
  file_count: number
  submitted_at: string          // ISO 8601 datetime
  jobs: Array<{
    qc_id: string              // From PDF filename (qc-abc-001 → qc-abc-001)
    job_id: string             // Backend-generated unique job ID
    filename: string           // Original filename from manifest
    original_name: string      // Human-readable name
    status: "QUEUED"
  }>
  message?: string
}
```

**Example**:

```json
{
  "success": true,
  "batch_id": "batch-abc123",
  "status": "SUBMITTED",
  "file_count": 5,
  "submitted_at": "2025-12-03T14:30:25.123Z",
  "jobs": [
    {
      "qc_id": "qc-abc-001",
      "job_id": "job-backend-xyz-001",
      "filename": "qc-abc-001.pdf",
      "original_name": "Chapter1_Theory.pdf",
      "status": "QUEUED"
    },
    {
      "qc_id": "qc-abc-002",
      "job_id": "job-backend-xyz-002",
      "filename": "qc-abc-002.pdf",
      "original_name": "Chapter1_MCQs.pdf",
      "status": "QUEUED"
    },
    {
      "qc_id": "qc-abc-003",
      "job_id": "job-backend-xyz-003",
      "filename": "qc-abc-003.pdf",
      "original_name": "Chapter2_Theory.pdf",
      "status": "QUEUED"
    },
    {
      "qc_id": "qc-abc-004",
      "job_id": "job-backend-xyz-004",
      "filename": "qc-abc-004.pdf",
      "original_name": "Chapter1_Theory.pdf",
      "status": "QUEUED"
    },
    {
      "qc_id": "qc-abc-005",
      "job_id": "job-backend-xyz-005",
      "filename": "qc-abc-005.pdf",
      "original_name": "Chapter2_MCQs.pdf",
      "status": "QUEUED"
    }
  ],
  "message": "Batch submitted successfully. 5 files queued for processing."
}
```

#### Response (Error - 400 Bad Request)

**HTTP Status**: `400 Bad Request`  
**Content-Type**: `application/json`

**Error Response Schema**:

```typescript
{
  success: false
  error: string                // Error code
  message: string              // Human-readable error message
  batch_id?: string            // If provided in request
  timestamp: string            // ISO 8601 datetime
}
```

**Error Codes**:

| Error Code | HTTP Status | Description | Resolution |
|------------|-------------|-------------|------------|
| `INVALID_ZIP` | 400 | ZIP file is corrupted or cannot be extracted | Re-upload valid ZIP |
| `MANIFEST_MISSING` | 400 | No `manifest.json` found in ZIP root | Include manifest.json in ZIP root |
| `FILE_COUNT_MISMATCH` | 400 | manifest.file_count doesn't match actual PDF count | Fix manifest or ZIP contents |
| `EMPTY_BATCH` | 400 | No PDF files found in ZIP | Include at least one PDF |
| `FILE_TOO_LARGE` | 413 | ZIP exceeds size limit | Reduce batch size or compress files |
| `INVALID_MANIFEST` | 400 | manifest.json has invalid JSON or schema | Fix manifest JSON format |
| `DUPLICATE_QC_ID` | 400 | Multiple PDFs with same qc_id | Ensure unique qc_id per file |

**Example Error Response**:

```json
{
  "success": false,
  "error": "MANIFEST_MISSING",
  "message": "ZIP file is missing required manifest.json in root directory",
  "batch_id": "batch-abc123",
  "timestamp": "2025-12-03T14:30:25.123Z"
}
```

---

### 2. Get Batch Status

**Endpoint**: `GET /qc/batches/{batch_id}`

**Description**: Returns the current status of a batch, including individual job statuses and results.

#### Request

**Method**: `GET`  
**Path Parameter**: `batch_id` (string, UUID)  
**Headers**:
- `Authorization: Bearer {api_key}`

**Example**:

```http
GET /qc/batches/batch-abc123 HTTP/1.1
Host: api.example.com
Authorization: Bearer your-api-key-here
```

#### Response (Processing - 200 OK)

**HTTP Status**: `200 OK`  
**Content-Type**: `application/json`

**Schema (Processing)**:

```typescript
{
  success: boolean
  batch_id: string
  status: "SUBMITTED" | "PROCESSING" | "PARTIAL_COMPLETE" | "COMPLETED" | "FAILED"
  file_count: number
  completed_count: number
  failed_count: number
  processing_count: number
  queued_count: number
  success_rate: number              // Percentage (0-100)
  submitted_at: string              // ISO 8601 datetime
  updated_at: string                // ISO 8601 datetime
  completed_at?: string             // ISO 8601 datetime (when done)
  processing_time_seconds?: number  // Total time when completed
  jobs: Array<{
    job_id: string
    qc_id: string
    filename: string
    original_name: string
    status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED"
    started_at?: string            // ISO 8601 datetime
    completed_at?: string          // ISO 8601 datetime
    failed_at?: string             // ISO 8601 datetime
    issues_count?: number          // Only when COMPLETED
    result?: string                // Markdown report when COMPLETED
    error?: string                 // Error message when FAILED
    error_code?: string            // Machine-readable error code
    retryable?: boolean            // Whether error is retryable
    retry_suggestion?: string      // Human-readable retry guidance
  }>
  summary?: {
    message: string
    failed_files: string[]
  }
}
```

**Example (Processing)**:

```json
{
  "success": true,
  "batch_id": "batch-abc123",
  "status": "PROCESSING",
  "file_count": 5,
  "completed_count": 2,
  "failed_count": 0,
  "processing_count": 3,
  "queued_count": 0,
  "success_rate": 40.0,
  "submitted_at": "2025-12-03T14:30:25.123Z",
  "updated_at": "2025-12-03T14:32:15.456Z",
  "jobs": [
    {
      "job_id": "job-backend-xyz-001",
      "qc_id": "qc-abc-001",
      "filename": "qc-abc-001.pdf",
      "original_name": "Chapter1_Theory.pdf",
      "status": "COMPLETED",
      "completed_at": "2025-12-03T14:31:45.123Z",
      "issues_count": 12,
      "result": "# QC Report\n\n## Summary\n- Total Issues: 12\n- High: 2\n- Medium: 5\n- Low: 5\n\n..."
    },
    {
      "job_id": "job-backend-xyz-002",
      "qc_id": "qc-abc-002",
      "filename": "qc-abc-002.pdf",
      "original_name": "Chapter1_MCQs.pdf",
      "status": "COMPLETED",
      "completed_at": "2025-12-03T14:32:10.789Z",
      "issues_count": 3,
      "result": "# QC Report\n\n## Summary\n- Total Issues: 3\n- High: 0\n- Medium: 1\n- Low: 2\n\n..."
    },
    {
      "job_id": "job-backend-xyz-003",
      "qc_id": "qc-abc-003",
      "filename": "qc-abc-003.pdf",
      "original_name": "Chapter2_Theory.pdf",
      "status": "PROCESSING",
      "started_at": "2025-12-03T14:32:00.000Z"
    },
    {
      "job_id": "job-backend-xyz-004",
      "qc_id": "qc-abc-004",
      "filename": "qc-abc-004.pdf",
      "original_name": "Chapter1_Theory.pdf",
      "status": "QUEUED"
    },
    {
      "job_id": "job-backend-xyz-005",
      "qc_id": "qc-abc-005",
      "filename": "qc-abc-005.pdf",
      "original_name": "Chapter2_MCQs.pdf",
      "status": "QUEUED"
    }
  ]
}
```

**Example (Completed with Failures)**:

```json
{
  "success": true,
  "batch_id": "batch-abc123",
  "status": "PARTIAL_COMPLETE",
  "file_count": 5,
  "completed_count": 4,
  "failed_count": 1,
  "processing_count": 0,
  "queued_count": 0,
  "success_rate": 80.0,
  "submitted_at": "2025-12-03T14:30:25.123Z",
  "updated_at": "2025-12-03T14:40:15.789Z",
  "completed_at": "2025-12-03T14:40:15.789Z",
  "processing_time_seconds": 590,
  "jobs": [
    {
      "job_id": "job-backend-xyz-001",
      "qc_id": "qc-abc-001",
      "filename": "qc-abc-001.pdf",
      "original_name": "Chapter1_Theory.pdf",
      "status": "COMPLETED",
      "completed_at": "2025-12-03T14:31:45.123Z",
      "issues_count": 12,
      "result": "# QC Report for Chapter1_Theory.pdf\n\n..."
    },
    {
      "job_id": "job-backend-xyz-002",
      "qc_id": "qc-abc-002",
      "filename": "qc-abc-002.pdf",
      "original_name": "Chapter1_MCQs.pdf",
      "status": "COMPLETED",
      "completed_at": "2025-12-03T14:32:10.789Z",
      "issues_count": 3,
      "result": "# QC Report for Chapter1_MCQs.pdf\n\n..."
    },
    {
      "job_id": "job-backend-xyz-003",
      "qc_id": "qc-abc-003",
      "filename": "qc-abc-003.pdf",
      "original_name": "Chapter2_Theory.pdf",
      "status": "COMPLETED",
      "completed_at": "2025-12-03T14:33:55.456Z",
      "issues_count": 8,
      "result": "# QC Report for Chapter2_Theory.pdf\n\n..."
    },
    {
      "job_id": "job-backend-xyz-004",
      "qc_id": "qc-abc-004",
      "filename": "qc-abc-004.pdf",
      "original_name": "Chapter1_Theory.pdf",
      "status": "COMPLETED",
      "completed_at": "2025-12-03T14:35:20.123Z",
      "issues_count": 0,
      "result": "# QC Report for Chapter1_Theory.pdf\n\n## Summary\n✅ No issues found!"
    },
    {
      "job_id": "job-backend-xyz-005",
      "qc_id": "qc-abc-005",
      "filename": "qc-abc-005.pdf",
      "original_name": "Chapter2_MCQs.pdf",
      "status": "FAILED",
      "failed_at": "2025-12-03T14:34:10.789Z",
      "error": "PDF parsing failed: Corrupted page 5",
      "error_code": "PDF_PARSE_ERROR",
      "retryable": true,
      "retry_suggestion": "Re-export PDF from source document and retry"
    }
  ],
  "summary": {
    "message": "Batch completed with 1 failure. 4 of 5 files processed successfully.",
    "failed_files": ["Chapter2_MCQs.pdf"]
  }
}
```

#### Response (Error - 404 Not Found)

**HTTP Status**: `404 Not Found`  
**Content-Type**: `application/json`

```json
{
  "success": false,
  "error": "BATCH_NOT_FOUND",
  "message": "Batch with ID 'batch-abc123' does not exist",
  "batch_id": "batch-abc123",
  "timestamp": "2025-12-03T14:32:15.456Z"
}
```

---

## Batch Status State Machine

Backend must maintain the following batch status progression:

```
SUBMITTED         → All jobs are QUEUED, batch accepted
    ↓
PROCESSING        → At least one job is PROCESSING
    ↓
    ├─→ COMPLETED        → All jobs COMPLETED successfully (100%)
    ├─→ PARTIAL_COMPLETE → Some jobs COMPLETED, some FAILED (mixed)
    └─→ FAILED           → All jobs FAILED (0% success)
```

**Status Calculation Rules**:

```python
def calculate_batch_status(jobs):
    total = len(jobs)
    completed = sum(1 for j in jobs if j.status == 'COMPLETED')
    failed = sum(1 for j in jobs if j.status == 'FAILED')
    processing = sum(1 for j in jobs if j.status == 'PROCESSING')
    
    if completed == total:
        return 'COMPLETED'
    elif failed == total:
        return 'FAILED'
    elif completed + failed == total:
        return 'PARTIAL_COMPLETE'
    elif processing > 0 or completed > 0 or failed > 0:
        return 'PROCESSING'
    else:
        return 'SUBMITTED'
```

---

## Processing Requirements

### 1. ZIP Extraction

- Extract ZIP to temporary directory
- Validate `manifest.json` exists and is valid JSON
- Parse manifest and verify:
  - `file_count` matches actual PDF count
  - All PDFs listed in manifest are present
  - All PDFs have unique `qc_id`
- Extract PDFs to processing directory

### 2. Job Creation

For each PDF in the ZIP:
- Generate unique `job_id` (backend-generated UUID or sequential ID)
- Map `qc_id` from filename to `job_id`
- Create job record in backend database
- Set initial status to `QUEUED`
- Preserve `original_name` from manifest for display

### 3. Job Processing

- Process jobs in the order specified by manifest (optional, or parallel)
- Update individual job status as processing progresses:
  - `QUEUED` → `PROCESSING` → `COMPLETED`/`FAILED`
- Store results (Markdown report) for completed jobs
- Store error details for failed jobs
- **Each job must reach a terminal state independently**

### 4. Partial Failure Handling

**Critical**: If one file fails, continue processing remaining files. Do NOT fail the entire batch.

**Example**:
```
File 1: COMPLETED ✅
File 2: FAILED ❌    ← Parse error
File 3: COMPLETED ✅  ← Continue processing
File 4: COMPLETED ✅
File 5: COMPLETED ✅

Final Batch Status: PARTIAL_COMPLETE (4/5 succeeded)
```

### 5. Result Aggregation

For `GET /qc/batches/{batch_id}`:
- Return all jobs with current status
- Include partial results for completed jobs
- Calculate success rate: `(completed_count / total) * 100`
- Generate summary message for UI display

---

## Error Codes

### Job-Level Error Codes

These apply to individual files within a batch:

| Error Code | Description | Retryable | Resolution |
|------------|-------------|-----------|------------|
| `PDF_PARSE_ERROR` | PDF structure is corrupted or invalid | Yes | Re-export PDF from source |
| `PDF_ENCRYPTED` | PDF is password-protected | No | Remove password protection |
| `FILE_TOO_LARGE` | PDF exceeds size limit for processing | No | Split or reduce file size |
| `TIMEOUT` | Processing exceeded time limit | Yes | Retry with simpler content |
| `ANALYSIS_FAILED` | QC analysis engine error | Yes | Retry, may be transient |
| `UNSUPPORTED_FORMAT` | PDF version or features not supported | No | Convert to supported format |

### Batch-Level Error Codes

These apply to the entire batch submission:

| Error Code | Description | HTTP Status | Resolution |
|------------|-------------|-------------|------------|
| `INVALID_ZIP` | ZIP file corrupted or malformed | 400 | Re-upload valid ZIP |
| `MANIFEST_MISSING` | No manifest.json in ZIP root | 400 | Include manifest.json |
| `INVALID_MANIFEST` | Manifest JSON is invalid | 400 | Fix JSON syntax |
| `FILE_COUNT_MISMATCH` | Manifest count ≠ actual PDF count | 400 | Fix manifest or ZIP |
| `EMPTY_BATCH` | No PDFs found in ZIP | 400 | Include at least one PDF |
| `DUPLICATE_QC_ID` | Multiple PDFs with same qc_id | 400 | Ensure unique IDs |
| `FILE_TOO_LARGE` | ZIP exceeds max size | 413 | Reduce batch size |
| `BATCH_NOT_FOUND` | Batch ID doesn't exist | 404 | Check batch_id |

---

## Polling Strategy

### Frontend Behavior

The frontend will poll `GET /qc/batches/{batch_id}` with the following strategy:

- **Interval**: Every 5 seconds (5000ms)
- **Polling per batch**, not per file (reduces API calls by ~10x)
- **Stops polling** when batch reaches terminal state: `COMPLETED`, `PARTIAL_COMPLETE`, or `FAILED`

**Expected Load**:
- 10 concurrent batches = 10 requests every 5 seconds
- Max ~120 requests per minute per client

### Backend Recommendations

1. **Cache batch status** for 2-3 seconds to reduce database queries
2. **Return immediately** - don't wait for jobs to complete
3. **Optimize for frequent polling** - this is a hot endpoint
4. **Use database indexes** on `batch_id` and `status` fields

---

## File Size Limits

### Recommended Limits

| Limit | Value | Rationale |
|-------|-------|-----------|
| Max ZIP size | 200 MB | Reasonable upload time (~30s on 50 Mbps) |
| Max PDF per file | 50 MB | Typical chapter size |
| Max files per batch | 20 | Balance throughput vs. memory |
| Min files per batch | 1 | Allow single-file batches |

### Frontend Defaults

The frontend uses these defaults:
- `batchSize`: 10 files
- `maxBatchSizeMB`: 150 MB
- `batchTimeoutSeconds`: 30 seconds

Backend should accommodate these values and return clear errors if limits exceeded.

---

## Authentication

All requests must include the API key in the header:

```http
Authorization: Bearer {api_key}
```

**OR** as a custom header:

```http
x-api-key: {api_key}
```

Return `401 Unauthorized` if missing or invalid:

```json
{
  "success": false,
  "error": "UNAUTHORIZED",
  "message": "Invalid or missing API key",
  "timestamp": "2025-12-03T14:30:25.123Z"
}
```

---

## ZIP Storage & Retention

### Recommendations

1. **Store uploaded ZIPs** for 24-48 hours for retry/debugging
2. **Delete ZIPs** after retention period to save storage
3. **Store extracted PDFs** until job completes + 7 days
4. **Log ZIP metadata** (size, file count, submission time) for analytics

### Storage Structure Example

```
/batch-storage/
  ├── batch-abc123/
  │   ├── original.zip              ← Original upload
  │   ├── extracted/
  │   │   ├── manifest.json
  │   │   ├── qc-abc-001.pdf
  │   │   ├── qc-abc-002.pdf
  │   │   └── ...
  │   └── results/
  │       ├── job-xyz-001.md        ← QC reports
  │       └── ...
  └── batch-def456/
      └── ...
```

---

## Example Workflow

### Scenario: Submit 5 files for QC

**Step 1: Frontend creates batch**
```
Files detected: Chapter1.pdf, Chapter2.pdf, Chapter3.pdf, Chapter4.pdf, Chapter5.pdf
Convert to PDF: ✓
Create ZIP: batch-abc123.zip (45 MB)
```

**Step 2: Frontend submits batch**
```http
POST /qc/batch-process
Content-Type: multipart/form-data

file=batch-abc123.zip
batch_id=batch-abc123
```

**Step 3: Backend responds with job mappings**
```json
{
  "success": true,
  "batch_id": "batch-abc123",
  "jobs": [
    {"qc_id": "qc-001", "job_id": "job-100"},
    {"qc_id": "qc-002", "job_id": "job-101"},
    {"qc_id": "qc-003", "job_id": "job-102"},
    {"qc_id": "qc-004", "job_id": "job-103"},
    {"qc_id": "qc-005", "job_id": "job-104"}
  ]
}
```

**Step 4: Frontend polls for status (every 5s)**
```http
GET /qc/batches/batch-abc123

T+5s:  Processing (0/5 completed)
T+10s: Processing (1/5 completed)
T+15s: Processing (2/5 completed)
T+20s: Processing (4/5 completed, 1 failed)
T+25s: PARTIAL_COMPLETE (4/5 completed, 1 failed)
```

**Step 5: Frontend updates UI**
```
✅ Chapter1.pdf - 12 issues found
✅ Chapter2.pdf - 3 issues found
❌ Chapter3.pdf - PDF parse error
✅ Chapter4.pdf - 0 issues found
✅ Chapter5.pdf - 8 issues found

Batch: 4 of 5 succeeded (80% success rate)
```

---

## Testing Checklist

### For Backend Developers

- [ ] Accept and extract ZIP files correctly
- [ ] Validate manifest.json schema
- [ ] Handle missing manifest gracefully
- [ ] Create unique job IDs for each PDF
- [ ] Map qc_id (from filename) to job_id correctly
- [ ] Process jobs independently (one failure doesn't stop others)
- [ ] Return partial results during processing
- [ ] Calculate success_rate correctly
- [ ] Handle empty batches (0 files)
- [ ] Handle large batches (20+ files)
- [ ] Handle corrupted PDFs within batch
- [ ] Set correct batch status (SUBMITTED → PROCESSING → COMPLETED/PARTIAL_COMPLETE/FAILED)
- [ ] Return proper error codes and messages
- [ ] Implement authentication (API key validation)
- [ ] Optimize for frequent polling (caching)
- [ ] Store ZIPs for retry (retention policy)
- [ ] Clean up old ZIPs and extracted files
- [ ] Log batch metrics (size, count, processing time)

---

## Support & Questions

For backend implementation questions, contact:
- **Email**: backend-team@example.com
- **Slack**: #qc-batch-processing

**Version**: 1.0  
**Last Updated**: December 3, 2025  
**Status**: Specification Complete
