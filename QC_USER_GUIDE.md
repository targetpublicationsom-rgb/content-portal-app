# Quality Check (QC) - User Guide

A simple guide to check your documents for quality issues.

---

## What Does This Do?

The Quality Check tool helps you find errors and issues in your Word documents. Just put your files in the right folder, and the app will:

1. ✅ Pick up your Word files automatically  
2. ✅ Check them for quality issues  
3. ✅ Create a report showing what needs to be fixed

---

## File Format Required

> ⚠️ **Only Word documents in `.docx` format are accepted.**
>
> - ✅ **Accepted**: `MyDocument.docx`
> - ❌ **Not accepted**: `.doc` (old Word format), `.pdf`, `.txt`, or any other format

Make sure your files are saved as `.docx` before adding them to the folder.

---

## How to Get Started

### Step 1: Choose Your Main Folder

1. Open the app and go to **QC → Settings**
2. Click **"Add Folder"**
3. Select any folder on your computer or shared drive
4. This will be your main folder where all files go

### Step 2: Turn On Monitoring

1. Click the **"Start Watching"** button
2. You'll see a green **"Active"** label when it's running

> ✅ **The app will automatically create two folders** inside your main folder:
> - 📁 `two-file format`
> - 📁 `three-file format`
>
> You don't need to create these yourself!

---

## Folder Structure - Where to Put Your Files

After clicking "Start Watching", you'll see two folders appear. Put your files in the correct one:

### Option 1: Two-File Format

Use this folder when your MCQs and Answers are in **one combined file**.

```
📁 Your Main Folder
 └── 📁 two-file format                     ← Auto-created by the app
      └── 📁 01 Introduction                ← Create one folder per chapter
           ├── 📄 Introduction_Theory.docx
           └── 📄 Introduction_MCQs.docx    ← Contains BOTH questions AND answers
```

**Files needed per chapter: 2**
| File | What It Contains |
|------|-----------------|
| `ChapterName_Theory.docx` | The theory/explanation content |
| `ChapterName_MCQs.docx` | MCQs with answers included |

---

### Option 2: Three-File Format

Use this folder when your MCQs and Answers are in **separate files**.

```
📁 Your Main Folder
 └── 📁 three-file format                   ← Auto-created by the app
      └── 📁 01 Introduction                ← Create one folder per chapter
           ├── 📄 Introduction_Theory.docx
           ├── 📄 Introduction_Questions[50].docx   ← Include question count in [brackets]
           └── 📄 Introduction_Solution[50].docx    ← Include answer count in [brackets]
```

**Files needed per chapter: 3**
| File | What It Contains |
|------|-----------------|
| `ChapterName_Theory.docx` | The theory/explanation content |
| `ChapterName_Questions[N].docx` | Only the MCQ questions (N = number of questions) |
| `ChapterName_Solution[N].docx` | Only the answers (N = number of answers) |

> ⚠️ **Important for Three-File Format**: You must include the question/answer count in square brackets `[N]` in the file name!
>
> - ✅ `Chapter1_Questions[50].docx` - Has 50 questions
> - ✅ `Chapter1_Solution[50].docx` - Has 50 answers
> - ❌ `Chapter1_Questions.docx` - Missing count!

---

## File Naming Rules ⚠️ Important!

The app finds your files by looking for **keywords** in the file name. Your files **must** contain these words:

| File Type | Must Include One Of These Words |
|-----------|--------------------------------|
| **Theory file** | `Theory` |
| **MCQs file** | `MCQ` or `MCQs` or `Question` or `Questions` |
| **Answers file** | `Solution` or `Solutions` or `Answer` or `Answers` |

### ✅ Good File Names (These Work)
- `Chapter 01_Theory.docx`
- `Living World_MCQs.docx`
- `Ch1 Questions.docx`
- `Biology_Solution.docx`
- `Unit 2 Answers.docx`

### ❌ Bad File Names (These Won't Work)
- `Chapter 01.docx` ← Missing keyword
- `LW_T.docx` ← "T" is not "Theory"
- `Problems.docx` ← "Problems" is not recognized

---

## Complete Example

Here's what your folders should look like after setup:

```
📁 D:\My Documents\QC Folder             ← Your main folder (you select this)
 │
 ├── 📁 two-file format                   ← Created automatically
 │    ├── 📁 01 Living World
 │    │    ├── 📄 Living World_Theory.docx
 │    │    └── 📄 Living World_MCQs.docx
 │    │
 │    └── 📁 02 Cell Biology
 │         ├── 📄 Cell Biology_Theory.docx
 │         └── 📄 Cell Biology_MCQs.docx
 │
 └── 📁 three-file format                 ← Created automatically
      ├── 📁 03 Plant Kingdom
      │    ├── 📄 Plant Kingdom_Theory.docx
      │    ├── 📄 Plant Kingdom_Questions[75].docx   ← 75 questions
      │    └── 📄 Plant Kingdom_Solution[75].docx    ← 75 answers
      │
      └── 📁 04 Animal Kingdom
           ├── 📄 Animal Kingdom_Theory.docx
           ├── 📄 Animal Kingdom_Questions[100].docx
           └── 📄 Animal Kingdom_Solution[100].docx
```

---

## Step-by-Step: Adding Files for Checking

1. **Create a chapter folder** inside either `two-file format` or `three-file format`
   - Example: Create folder `01 Introduction`

2. **Add your Word files** to the chapter folder with correct names
   - For two-file: Add `_Theory.docx` and `_MCQs.docx`
   - For three-file: Add `_Theory.docx`, `_Questions[N].docx`, and `_Solution[N].docx`
     - Replace `[N]` with the actual count, e.g., `[50]` for 50 questions

3. **Wait for the app to detect the files**
   - The app waits a few seconds to make sure all files are copied
   - You'll see new entries appear in the Files list

---

## Understanding the Screens

### Dashboard
Your home screen showing:
- How many files have been checked
- How many completed today
- How many are still being processed
- How many had problems

### Files
A list of all your documents showing:
- File name
- Chapter name
- Current status
- Number of issues found
- Buttons to view reports or retry

### Batches
Groups of files sent together for checking:
- See which files are in each group
- View progress
- Retry any that failed

---

## How Batching Works

Files are grouped together and sent as a "batch" for faster processing. A batch is sent when **any** of these happen:

| When This Happens | Batch is Sent |
|------------------|---------------|
| **5 files are ready** | As soon as 5 files are converted, they're sent together |
| **2 minutes pass** | If any files are waiting, they're sent after 2 minutes (120 seconds) |
| **All files are done** | When there are no more files to convert and at least 5 are ready |

### What This Means for You

- 📦 Your files may wait a bit to be grouped with others
- ⏱️ Maximum wait time is 2 minutes
- 👥 If you're adding many files, they'll be sent in groups of 5
- ✅ You don't need to do anything - batching happens automatically

### Settings
- Choose your main folder
- Start or stop monitoring

---

## Understanding File Status

Here's what each status means:

| What You See | What It Means |
|-------------|---------------|
| **Queued** | File is waiting in line |
| **Validating** | Checking if question numbers match answer numbers |
| **Merging** | Combining your Questions and Solution files into one |
| **Converting** | Turning your Word file into a PDF |
| **Converted** | PDF is ready, waiting to be sent for checking |
| **Submitting** | Sending to the checking service |
| **Verifying** | Confirming the file was received |
| **Processing** | Being analyzed for quality issues |
| **Downloading** | Getting your report |
| **Completed** | ✅ Done! Report is ready to view |
| **Failed** | ❌ Something went wrong (you can retry) |
| **Conversion Failed** | Could not create PDF from your Word file |
| **Numbering Failed** | Question numbers don't match answer numbers |

---

## How to View Your Reports

When a file shows **"Completed"**:

1. Go to **QC → Files**
2. Find your file in the list
3. Click the **📄 document button** to read the report on screen
4. Click the **⬇️ download button** to save as a Word file

The report will show:
- What issues were found
- How serious each issue is (Low, Medium, or High)
- Details about each problem

---

## What to Do If Something Fails

### If a file shows "Failed"
1. Go to **QC → Files**
2. Find the file
3. Click the **🔄 retry button**

### If "Numbering Failed" appears
Your question numbers don't match your answer numbers.
1. Open your Questions file and count the questions
2. Open your Solution file and count the answers
3. Make sure they match (Q1→A1, Q2→A2, etc.)
4. Fix any issues in your files
5. Click **Retry**

### If "Conversion Failed" appears
1. Click the **📤 upload button**
2. Select a PDF version of your document
3. The check will continue

### If a whole batch fails
1. Go to **QC → Batches**
2. Find the batch with failures
3. Click **"Retry Failed"**

---

## Working with Others

Multiple people can use this at the same time:
- Everyone sees the same file list
- Files won't be checked twice
- You can see who processed each file

> **Note**: Everyone must use the same main folder.

---

## What You Need

Before using this feature, make sure:

1. ✅ **Microsoft Word** is installed on your computer
2. ✅ You can access the folder (if using a shared drive)
3. ✅ Your computer is connected to the internet

---

## Helpful Tips

- 💡 Create all chapter folders before adding files
- 💡 Make sure all files for a chapter are ready before copying them
- 💡 Stop monitoring when not using it (click "Stop Watching")
- 💡 Keep backups of your original files
- 💡 Click **Refresh** if you don't see updates

---

## Common Problems & Solutions

### My files aren't being detected
- Is monitoring **Active**? (Check Settings for green label)
- Are files `.docx` format? (not `.doc`)
- Is Word closed? (Close if file is open)
- Are files in a chapter folder inside `two-file format` or `three-file format`?
- Do file names contain the right keywords? (Theory, MCQ, Question, Solution, Answer)

### Numbering keeps failing
- Count questions in your Questions file
- Count answers in your Solution file
- Make sure the numbers match
- Check that numbering is 1, 2, 3... (not 1, 3, 5...)

### A file keeps failing
- Open the file in Word to check it's not damaged
- Save a fresh copy and try again
- Try the "upload PDF" option

### Files seem stuck
- Files stuck for more than 10 minutes will show as Failed
- Click **Retry**
- Check your internet connection

---

## Quick Summary

1. 📁 **Select your main folder** (Settings → Add Folder)
2. ▶️ **Click "Start Watching"** (creates the two format folders)
3. 📂 **Create chapter folders** inside `two-file format` or `three-file format`
4. 📄 **Add your .docx files** with correct names (Theory, MCQ, Question, Solution)
5. ⏳ **Wait** for processing
6. 📊 **View reports** when complete
7. 🔄 **Retry** any that failed
