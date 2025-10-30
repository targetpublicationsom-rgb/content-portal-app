# Building Content Portal Windows App

This document explains how to build the Content Portal Windows App into a distributable executable.

## Prerequisites

- **Node.js** (version 16 or later) - Download from [nodejs.org](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Windows** (for building Windows executables)

## Quick Build

### Option 1: Using the Build Script (Recommended)

Run one of these scripts in the project root:

```bash
# PowerShell
.\build-app.ps1
```

### Option 2: Manual Build

```bash
# Install dependencies
npm install

# Build the application
npm run build

# Create Windows executables
npm run dist:win
```

## Build Outputs

After building, check the `dist` folder for:

- **NSIS Installer**: `content-portal-windows-app-1.0.0-setup.exe` - Full installer
- **Portable App**: `content-portal-windows-app-1.0.0-portable.exe` - Standalone executable
- **Unpacked**: `win-unpacked/` - Directory with all files

## What's Included

The built executable includes:

✅ **Main Application**: Electron-based desktop app  
✅ **Tools Folder**: `content-orchestrator.exe` standalone executable  
✅ **Resources**: Icons, assets, and configuration files  
✅ **Dependencies**: All required Node.js modules  

## Build Scripts Available

- `npm run build` - Build the Electron app
- `npm run build:win` - Build Windows version
- `npm run build:win-portable` - Build portable Windows version
- `npm run build:win-nsis` - Build NSIS installer
- `npm run dist` - Build all platforms
- `npm run dist:win` - Build Windows with all targets

## Troubleshooting

### Build Fails
- Make sure Node.js and npm are installed
- Delete `node_modules` and run `npm install` again
- Check that the `tools/content-orchestrator.exe` file exists

### App Won't Start
- Check if the executable has proper permissions
- Verify that the tools folder is included in the build
- Check Windows Defender or antivirus (may block the executable)

### Development vs Production Paths
The app automatically detects whether it's running in development or production mode and adjusts file paths accordingly:

- **Development**: Uses `tools/content-orchestrator.exe` from project root
- **Production**: Uses `app.asar.unpacked/tools/content-orchestrator.exe` from installed location

## Distribution

The generated files are ready for distribution:

1. **For end users**: Use the NSIS installer (.exe)
2. **For testing**: Use the portable version
3. **For debugging**: Use the unpacked directory

## File Structure in Built App

```
content-portal-windows-app/
├── content-portal-windows-app.exe    # Main application
├── resources/
│   └── app.asar.unpacked/
│       └── tools/
│           └── content-orchestrator.exe    # Standalone server
└── ... (other Electron files)
```