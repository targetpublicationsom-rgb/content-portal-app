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
  status TEXT NOT NULL,             -- QUEUED|CONVERTING|PROCESSING|COMPLETED|FAILED
  submitted_at TEXT NOT NULL,       -- ISO timestamp
  completed_at TEXT,                -- ISO timestamp
  report_md_path TEXT,              -- Markdown report path
  report_docx_path TEXT,            -- DOCX report path
  qc_score REAL,                    -- 0-100
  issues_found INTEGER,             -- Count
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
```

**Key Methods:**
- `initialize(mainWindow)`: Setup entire QC system
- `shutdown()`: Cleanup all resources
- `restartWatcher()`: Reload config + reinit database + restart watcher
- `processNewFile()`: Main file processing logic
- `handleConversionComplete()`: Post-conversion handler

**File Processing Flow (`processNewFile`):**
```
1. Clean stale locks (>10 min)
2. Check if file locked by another user → Skip if locked
3. Check database for duplicate (within 5 min) → Skip if found
4. Acquire lock for this file → Error if fails
5. Create database record (status: QUEUED)
6. Queue file for conversion
7. On success: Release lock
8. On error: Release lock, update record with error
```

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
- Columns: Filename, Status, Submitted, Completed, Score, Issues, Processed By
- Filter by status
- Delete individual/all records

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

4. Conversion starts
   - Status: CONVERTING
   - Word COM converts DOCX → PDF
   - PDF saved to `{WatchFolder}\.qc\pdfs\{qcId}\report.pdf`

5. Conversion completes
   - Status: COMPLETED
   - Lock released
   - Record updated with PDF path, completion time
   - User sees update in File List

6. If another user drops same file (within 5 min)
   - Watcher detects file
   - Database check finds existing record → Skip
   - No duplicate processing

7. If file locked by another machine
   - Watcher detects file
   - Lock check shows locked by User2@Machine2 → Skip
   - Logs: "File already locked by User2@Machine2"

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

## File Structure

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

3. **5-minute duplicate window**
   - Prevents re-processing same file
   - Short enough to allow reprocessing if needed
   - Long enough to avoid race conditions

4. **Centralized .qc folder**
   - All data in one place
   - Easy to backup/share
   - Simplified multi-user deployment

5. **Read-only config at runtime**
   - Prevents user errors
   - Forces deliberate configuration
   - Clearer deployment model

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
