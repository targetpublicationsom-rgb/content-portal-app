# content-portal-windows-app

An Electron application with React, TypeScript, and Python FastAPI backend integration.

## 🚀 Quick Start

See [QUICKSTART.md](./QUICKSTART.md) for a 5-minute setup guide.

```bash
# Install dependencies
npm install
cd python-server && pip install -r requirements.txt && cd ..

# Run the app
npm run dev
```

## 📚 Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - Get started in 5 minutes
- **[INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)** - Detailed architecture and integration docs
- **[python-server/README.md](./python-server/README.md)** - Python API documentation
- **[SYSTEM_TRAY.md](./SYSTEM_TRAY.md)** - System tray feature guide

## ✨ Features

- ⚡ **Automatic Python Server Management** - Python FastAPI server starts automatically with Electron
- 🔄 **Auto-Restart** - Server automatically restarts if it crashes
- 🎯 **Type-Safe IPC** - Fully typed communication between processes
- 🎨 **Modern UI** - React with Tailwind CSS and shadcn/ui components
- 📦 **Production Ready** - Can bundle Python server as standalone executable
- 🖥️ **System Tray Support** - Minimize to tray, app stays running in background

## 🏗️ Architecture

```
Electron Main Process
    ↓ (spawns)
Python FastAPI Server (prints port to stdout)
    ↓ (reads)
Electron saves to server-info.json
    ↓ (reads via IPC)
React Renderer makes HTTP requests
```

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
