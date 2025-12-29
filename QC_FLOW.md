# QC Module - Complete Flow Documentation

## Overview
The QC (Quality Check) module is a multi-user file processing system that watches a network folder for DOCX files, converts them to PDF, and tracks the process. Multiple users can run the app simultaneously without processing duplicate files.

---

## Architecture Components

### 1. **Configuration System** (`qcConfig.ts`)
- **Purpose**: Load and manage configuration from `.env` file
- **Key Functions**:
  - `loadEnvConfig()`: Reads VITE_QC_* variables from environment
  - `initializeQCConfig()`: Initializes config at startup and logs settings
  - `getConfig()`: Returns current configuration
  - `getDatabasePath()`: Returns path to SQLite database (WatchFolder\.qc\qc.db)
  - `getLockBasePath()`: Returns watch folder path
  - `getQCOutputPaths()`: Returns paths for PDF and reports (WatchFolder\.qc\pdfs\{qcId}\)

**Environment Variables Required:**
```env
VITE_QC_WATCH_FOLDER=D:\Target Publications\Watch
VITE_QC_API_URL=https://api.example.com/qc
VITE_QC_API_KEY=your-api-key-here
VITE_QC_POLLING_INTERVAL=5000
VITE_QC_AUTO_SUBMIT=true
VITE_QC_MAX_RETRIES=3
```

**How It Works:**
- Vite's `loadEnv()` reads `.env` file at build time
- Values are injected into main process via `electron.vite.config.ts`
- Config is read-only at runtime - changes require app restart

---

### 2. **Database System** (`qcStateManager.ts`)
- **Purpose**: Track all QC records in a shared SQLite database
- **Database Location**: `{VITE_QC_WATCH_FOLDER}\.qc\qc.db`
- **Journal Mode**: DELETE (network-compatible, not WAL)
- **Busy Timeout**: 5000ms for concurrent access

**Schema:**
```sql
CREATE TABLE qc_records (
  qc_id TEXT PRIMARY KEY,           -- UUID
  file_path TEXT NOT NULL,          -- Original file path
  original_name TEXT NOT NULL,      -- Filename
  pdf_path TEXT,                    -- Output PDF path
  status TEXT NOT NULL,             -- QUEUED|CONVERTING|SUBMITTING|PROCESSING|DOWNLOADING|CONVERTING_REPORT|COMPLETED|FAILED
  submitted_at TEXT NOT NULL,       -- ISO timestamp
  completed_at TEXT,                -- ISO timestamp
  report_md_path TEXT,              -- Markdown report path
  report_docx_path TEXT,            -- DOCX report path
  qc_score REAL,                    -- 0-100
  issues_found INTEGER,             -- Count
  issues_low INTEGER DEFAULT 0,     -- Low severity count
  issues_medium INTEGER DEFAULT 0,  -- Medium severity count
  issues_high INTEGER DEFAULT 0,    -- High severity count
  external_qc_id TEXT,              -- API reference
  error_message TEXT,               -- Error details
  retry_count INTEGER DEFAULT 0,    -- Retry attempts
  processed_by TEXT                 -- username@hostname
)
```

**Key Functions:**
- `initializeQCDatabase()`: Creates database and tables
- `reinitializeQCDatabase()`: Closes and reopens database (for config changes)
- `createQCRecord()`: Inserts new record with QUEUED status
- `updateQCRecord()`: Updates record fields
- `getQCRecord()`: Get single record by ID
- `getQCRecords()`: Query records with filters
- `getRecordByFilePath()`: Check if file already processed
- `getQCStats()`: Calculate statistics (total, queued, completed, etc.)

---

### 3. **File Locking System** (`qcLockManager.ts`)
- **Purpose**: Prevent duplicate processing across multiple machines
- **Lock Location**: `{VITE_QC_WATCH_FOLDER}\.qc\{sanitized-filename}.lock`
- **Lock Timeout**: 10 minutes (stale locks auto-cleaned)

**Lock File Format:**
```json
{
  "qcId": "uuid",
  "filePath": "D:\\path\\to\\file.docx",
  "processedBy": "username@hostname",
  "timestamp": "2025-11-25T10:30:00Z",
  "hostname": "DESKTOP-ABC123"
}
```

**Key Functions:**
- `acquireLock()`: Creates lock file, returns {success, lockedBy?, error?}
- `releaseLock()`: Removes lock file
- `checkLock()`: Returns lock info or null
- `cleanStaleLocks()`: Removes locks older than 10 minutes
- `getUserIdentifier()`: Returns "username@hostname"

**How It Works:**
1. Before processing, check if lock exists
2. If locked by another user, skip file
3. Acquire lock before creating database record
4. Release lock after success or error
5. Stale locks (>10 min) cleaned automatically

---

### 4. **File Watcher** (`qcWatcher.ts`)
- **Purpose**: Monitor folder for new DOCX files
- **Library**: chokidar v4.0.3
- **Watch Pattern**: `**/*.docx`
- **Ignored**: Temporary files (~$*.docx), hidden files

**Key Functions:**
- `startQCWatcher(folders)`: Start watching specified folders
- `stopQCWatcher()`: Stop all watchers
- `isQCWatcherActive()`: Check if watching
- `getQCWatcher()`: Get watcher instance

**Events Emitted:**
- `file-detected`: New DOCX file found
- `error`: Watcher error

---

### 5. **DOCX to PDF Converter** (`qcWordConverter.ts`)
- **Purpose**: Convert DOCX files to PDF using Microsoft Word COM
- **Technology**: winax (Windows Automation COM bridge)
- **Word Instance**: Single shared instance for all conversions

**Key Functions:**
- `initializeWordConverter()`: Launch Word COM instance
- `convertDocxToPdf()`: Convert single file
- `shutdownWordConverter()`: Close Word instance

**Conversion Process:**
1. Open DOCX file in Word (invisible)
2. Save as PDF format
3. Close document
4. Return success/error

**Error Handling:**
- File not found
- Word COM failure
- Conversion timeout
- Disk space issues

---

### 6. **Orchestrator** (`qcOrchestrator.ts`)
- **Purpose**: Coordinate all QC operations
- **Pattern**: Singleton instance
- **Concurrency**: Limited to 1 concurrent job (sequential processing)
- **Job Queue**: FIFO queue with retry support

**Initialization Flow:**
```
1. initializeQCConfig()          → Load .env variables
2. initializeQCDatabase()        → Create/open SQLite database
3. initializePandoc()            → Check Pandoc availability
4. initializeQCNotifications()   → Setup UI notifications
5. initializeWordConverter()     → Launch Word COM
6. setupWatcherEvents()          → Listen to file-detected events
7. setupConverterEvents()        → Listen to conversion events
8. configureExternalService()    → Setup API if configured
9. startStatusPolling()          → Poll for external QC status updates
```

**Key Methods:**
- `initialize(mainWindow)`: Setup entire QC system
- `shutdown()`: Cleanup all resources (stops watcher, Word, database)
- `restartWatcher()`: Reload config + reinit database + restart watcher
- `processNewFile(filePath, filename, isRetry)`: Main file processing logic
- `enqueueJob(filePath, filename, isRetry)`: Add job to queue
- `processQueue()`: Process queued jobs respecting concurrency limits
- `retryRecord(qcId)`: Retry failed jobs with updated timestamp
- `handleConversionComplete()`: Post-conversion handler

**File Processing Flow (`processNewFile`):**
```
1. Clean stale locks (>10 min)
2. Check if file locked by another user → Skip if locked
3. Check database for existing record:
   - Skip if COMPLETED
   - Skip if in progress (QUEUED/CONVERTING/etc.) for <10 min
   - Mark as FAILED if stuck for >10 min
   - Skip if FAILED (use Retry button)
   - Skip all checks if isRetry=true
4. Acquire lock for this file → Error if fails
5. Create database record (status: QUEUED)
6. Convert DOCX to PDF (status: CONVERTING)
7. Submit to external API (status: SUBMITTING)
8. Poll for completion (status: PROCESSING)
9. Download report (status: DOWNLOADING)
10. Convert report to DOCX (status: CONVERTING_REPORT)
11. Parse and save severity breakdown (Low/Medium/High)
12. Update status to COMPLETED
13. Release lock
14. On error: Release lock, update record with error
```

**Retry Logic:**
- Resets `submitted_at` timestamp to prevent false "stuck file" detection
- Updates status to QUEUED and clears error messages
- Enqueues job with `isRetry=true` flag to bypass duplicate checks
- Immediately triggers queue processing

**Concurrency Control:**
- `MAX_CONCURRENT_JOBS = 1`: Sequential processing to prevent Word/memory issues
- Jobs are queued and processed one at a time
- Queue status emitted to renderer for UI updates

---

### 7. **IPC Handlers** (`qcIpcHandlers.ts`)
- **Purpose**: Bridge between renderer and main process
- **Protocol**: Electron IPC (Inter-Process Communication)

**Available Handlers:**
```typescript
qc:get-records         → Get list of QC records with filters
qc:get-record          → Get single record by ID
qc:get-stats           → Get statistics (total, completed, etc.)
qc:get-config          → Get current configuration (read-only)
qc:test-connection     → Test external API connection
qc:get-watcher-status  → Check if watcher is active
qc:start-watcher       → Start watching folder
qc:stop-watcher        → Stop watching folder
qc:retry-record        → Retry failed QC job
qc:delete-record       → Delete single record
qc:delete-all-records  → Delete all records
```

**Real-time Events (Main → Renderer):**
```typescript
qc:file-detected       → New file detected
qc:status-update       → Record status changed
qc:queue-update        → Queue length changed
qc:error               → Error occurred
```

---

### 8. **UI Components**

#### **QCDashboard.tsx**
- Shows statistics cards (Total, Queued, Processing, Completed, Failed)
- **Start/Stop Watching Button**: Controls file watcher
- **Status Badge**: Shows "Watching" (green) or "Stopped" (gray)
- Auto-refreshes stats every 5 seconds

#### **QCFileList.tsx**
- Table of all QC records
- Columns: Filename, Status, Submitted, Completed, Score, Issues (with severity breakdown: Low/Medium/High), Processed By
- **Status Badges**: Color-coded (QUEUED=yellow, CONVERTING=blue, PROCESSING=purple, COMPLETED=green, FAILED=red)
- **Retry Button**: For failed records, resets timestamp and re-queues
- Filter by status
- Delete individual/all records
- Real-time updates via IPC events

#### **Services (`qc.service.ts`)**
- Wrapper around IPC calls
- Error handling and type safety
- Event listener subscriptions

---

## Complete User Flow

### **Setup (One-time)**
1. Configure `.env` file:
   ```env
   VITE_QC_WATCH_FOLDER=\\server\share\documents
   ```
2. Build/restart app to load environment variables
3. App creates `\\server\share\documents\.qc\` folder automatically

### **Daily Usage**
1. User opens app → Dashboard shows "Stopped"
2. Click **"Start Watching"** button
   - App reloads config from `.env`
   - Reinitializes database at `{WatchFolder}\.qc\qc.db`
   - Starts watching for DOCX files
   - Status changes to "Watching" (green)

3. User drops `report.docx` into watch folder
   - Watcher detects file
   - Orchestrator checks lock → Not locked
   - Orchestrator checks database → Not processed recently
   - Orchestrator acquires lock (`report.docx.lock`)
   - Creates database record (status: QUEUED)
   - Queues for conversion

4. Conversion and submission starts (sequential, one at a time)
   - Status: CONVERTING → Word COM converts DOCX → PDF
   - PDF saved to `{WatchFolder}\.qc\pdfs\{qcId}\report.pdf`
   - Status: SUBMITTING → Uploads PDF to external API
   - Status: PROCESSING → External service analyzes document
   - Orchestrator polls for completion every 5 seconds
   - Status: DOWNLOADING → Downloads QC report (Markdown)
   - Status: CONVERTING_REPORT → Converts report to DOCX using Pandoc
   - Parses findings for severity breakdown (Low/Medium/High)

5. Processing completes
   - Status: COMPLETED
   - Lock released
   - Record updated with PDF path, report paths, severity counts, completion time
   - User sees update in File List with issue breakdown

6. If job fails
   - Status: FAILED
   - Error message saved to database
   - User can click "Retry" button to re-process
   - Retry resets timestamp and bypasses duplicate checks

7. If another user drops same file
   - Watcher detects file
   - Database check finds existing record → Skip
   - No duplicate processing

7. If file locked by another machine
   - Watcher detects file
   - Lock check shows locked by User2@Machine2 → Skip
   - Logs: "File already locked by User2@Machine2"

8. If file stuck in processing (>10 minutes)
   - Next watcher scan detects file
   - Time check shows >10 min in QUEUED/PROCESSING state
   - Automatically marks as FAILED
   - User can retry via UI button

### **Multi-User Coordination**
- **Machine 1**: Drops `file.docx` at 10:00:00
  - Acquires lock immediately
  - Starts processing

- **Machine 2**: Drops `file.docx` at 10:00:05 (5 seconds later)
  - Checks lock → Found (locked by Machine1)
  - Skips processing
  - Logs: "File already locked by user1@Machine1"

- **Machine 1**: Completes at 10:00:30
  - Releases lock
  - Updates database: status=COMPLETED

- **Machine 2**: Next scan sees completed record in database
  - Checks database → Found (processed 25 seconds ago)
  - Skips processing

---

---

## Supported File Formats

The QC watcher supports three folder formats for organizing content files. Each format has a specific naming convention and processing behavior.

### **1. Two-File Format (`two-file-format/`)**

**Structure:**
```
two-file-format/
  Chapter-Name/
    ├── Chapter-Name_Theory.docx              → Theory content
    └── Chapter-Name_MCQs & Solution.docx     → MCQs with solutions combined
```

**File Type Detected:** `mcqs-solution`

**Processing:**
- Theory file: Converted to PDF, submitted directly
- MCQs+Solution file: Converted to PDF, submitted directly
- No merging or validation required
- Independent processing (can be submitted at different times)

**Filename Keywords:**
- Theory: `_theory` or ` theory` (case-insensitive)
- MCQs: `_mcq`, ` mcq`, `_question`, ` question`
- Solution: Part of MCQs filename (e.g., contains `solution`, `answer`)

---

### **2. Three-File Format (`three-file-format/`)**

**Structure:**
```
three-file-format/
  Chapter-Name/
    ├── Chapter-Name_Theory.docx              → Theory content
    ├── Chapter-Name_MCQs.docx                → Questions only
    └── Chapter-Name_Solution.docx            → Answers only
```

**File Type Detected:** `mcqs-solution` (before merge) → `merged-mcqs-solution` (after merge)

**Processing:**
1. **Numbering Validation**: Questions and Solutions are validated to ensure numbering matches
   - Status: `VALIDATING` → Checks that question numbers align with solution numbers
   - If validation fails: Status `NUMBERING_FAILED` (user must fix and retry)
2. **Merging**: MCQs and Solution files are merged into single file
   - Status: `MERGING` → Word document processing
   - Merged file created in `.qc/` folder
3. **Conversion & Submission**: Merged file converted to PDF and submitted

**Filename Keywords:**
- Theory: `_theory` or ` theory`
- MCQs: `_mcq`, ` mcq`, `_question`, ` question`
- Solution: `_solution`, ` solution`, `_answer`, ` answer`

**Note:** MCQs and Solution files can be uploaded in either order. The system auto-detects and swaps them if reversed.

---

### **3. Subjective Format (`subjective-format/`)**

**Structure:**
```
subjective-format/
  Chapter-Name/
    └── Chapter-Name_Subjective.docx          → Subjective content
```

**File Type Detected:** `subjective`

**Processing:**
- Single file format (similar to two-file MCQs+Solution)
- **No validation or merging required**
- File converted to PDF and submitted directly to QC backend
- Processed independently without waiting for related files

**Filename Keywords:**
- Subjective: `_subjective` or ` subjective` (case-insensitive)

**Use Case:** Essays, assignments, or other subjective content that doesn't require numbering validation or file merging

---

## File Structure

### **Folder Layout (Complete)**
```
{VITE_QC_WATCH_FOLDER}/
  ├── two-file-format/
  │   ├── 01 Chapter/
  │   │   ├── 01 Chapter_Theory.docx
  │   │   └── 01 Chapter_MCQs & Solution.docx
  │   └── 02 Chapter/
  │       └── ...
  ├── three-file-format/
  │   ├── 01 Chapter/
  │   │   ├── 01 Chapter_Theory.docx
  │   │   ├── 01 Chapter_MCQs.docx
  │   │   └── 01 Chapter_Solution.docx
  │   └── 02 Chapter/
  │       └── ...
  ├── subjective-format/
  │   ├── 01 Chapter/
  │   │   └── 01 Chapter_Subjective.docx
  │   └── 02 Chapter/
  │       └── ...
  └── .qc/                          (Created automatically)
      ├── qc.db                     → SQLite database (shared)
      ├── qc.db-journal             → Temporary during writes
      ├── report.docx.lock          → Lock file during processing
      └── pdfs/
          └── a1b2c3d4/             → First 8 chars of QC ID
              ├── report.pdf        → Converted PDF
              ├── qc_report.md      → Markdown report
              └── qc_report.docx    → DOCX report
```

### **.qc Folder (Created Automatically)**
```
{VITE_QC_WATCH_FOLDER}/
  .qc/
    ├── qc.db                    → SQLite database (shared)
    ├── qc.db-journal            → Temporary during writes
    ├── report.docx.lock         → Lock file during processing
    └── pdfs/
        └── a1b2c3d4/            → First 8 chars of QC ID
            ├── report.pdf       → Converted PDF
            ├── qc_report.md     → Markdown report
            └── qc_report.docx   → DOCX report
```

---

## Configuration Changes

### **To Change Watch Folder:**
1. Stop watcher (click "Stop Watching")
2. Edit `.env` file: `VITE_QC_WATCH_FOLDER=D:\New\Path`
3. Restart dev server (Ctrl+C, then `npm run dev`)
4. Click "Start Watching" - new path will be used

### **Why Restart is Required:**
- Vite injects environment variables at build time
- Main process code is compiled with these values
- Runtime changes to `.env` don't affect compiled code
- Full rebuild needed to pick up new values

---

## Error Handling

### **Common Errors:**
1. **"No watch folders configured"**
   - Solution: Set `VITE_QC_WATCH_FOLDER` in `.env`, restart

2. **"Failed to acquire lock"**
   - Solution: Another user processing file, wait or check locks

3. **"Word conversion failed"**
   - Solution: Check if Word installed, file not corrupted

4. **"Database locked"**
   - Solution: Another process accessing database, retry in a moment

5. **"Stuck in QUEUED/PROCESSING state"**
   - Automatic: Marked as FAILED after 10 minutes
   - Manual: Click "Retry" button to reprocess

6. **"External API error"**
   - Check API URL and API key in `.env`
   - Test connection via dashboard
   - View error message in file list

### **Retry Strategy:**
- Failed jobs can be retried via UI button
- Retry resets timestamp and clears error state
- Bypasses duplicate detection checks
- Respects concurrency limits (queued if other job running)

---

## Cleanup & Maintenance

### **Stale Lock Cleanup:**
- Automatic: Every time `processNewFile()` runs
- Removes locks older than 10 minutes
- Prevents abandoned locks from blocking files

### **Database Cleanup:**
- Manual: Click "Delete All Records" in File List
- Or: Delete specific records via UI
- Database file persists (history maintained)

---

## Key Design Decisions

1. **SQLite with DELETE journal mode** (not WAL)
   - Better network drive compatibility
   - WAL requires filesystem features not always available on network shares

2. **File-based locking** (not database locks)
   - Works across machines and networks
   - Survives process crashes
   - Visible for debugging

3. **Stuck file detection (10 minutes)**
   - Automatically marks jobs as FAILED if stuck
   - Prevents indefinite blocking
   - User can manually retry

4. **Sequential processing (concurrency = 1)**
   - Prevents Word memory issues and app freezing
   - Ensures stable document conversion
   - Single Word instance handles all conversions

5. **Retry mechanism**
   - Resets timestamp to prevent false "stuck" detection
   - Bypasses duplicate checks with `isRetry` flag
   - Clears error messages and external IDs

6. **Severity breakdown tracking**
   - Parses QC report findings for Low/Medium/High severity
   - Stores counts in database
   - Displays grouped in UI (e.g., "Issues: 2 Low, 5 Medium, 1 High")

7. **Centralized .qc folder**
   - All data in one place
   - Easy to backup/share
   - Simplified multi-user deployment

8. **Read-only config at runtime**
   - Prevents user errors
   - Forces deliberate configuration
   - Clearer deployment model

9. **No notification on start**
   - Reduces notification noise
   - Only notifies on completion or failure

---

## Development Notes

### **Adding New Environment Variables:**
1. Add to `.env` and `.env.example`
2. Add to `electron.vite.config.ts` define section
3. Update `loadEnvConfig()` in `qcConfig.ts`
4. Restart dev server

### **Testing Multi-User:**
1. Set watch folder to network path
2. Build app on two machines
3. Both machines point to same `.env` watch folder
4. Drop files simultaneously
5. Check logs for lock coordination

### **Debugging:**
- Main process logs: Electron DevTools Console
- Database queries: Enable SQLite logging
- Lock files: Check `.qc\*.lock` contents
- Environment variables: Log in `initializeQCConfig()`
