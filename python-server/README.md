# Python FastAPI Server for Electron Integration

This directory contains the Python FastAPI backend server that integrates with the Electron app.

## Setup

### 1. Install Python Dependencies

```bash
cd python-server
pip install -r requirements.txt
```

### 2. Test the Server Standalone

You can test the server independently before running it through Electron:

```bash
python -m orchestrator.server
```

This will start the server and print JSON output like:

```json
{ "port": 8000 }
```

### 3. Test API Endpoints

Once running, test the endpoints:

```bash
# Health check
curl http://127.0.0.1:8000/health

# Get jobs
curl http://127.0.0.1:8000/jobs

# Create a job
curl -X POST http://127.0.0.1:8000/jobs \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Job", "description": "My first job"}'
```

## API Endpoints

- `GET /health` - Health check endpoint
- `GET /jobs` - Get all jobs
- `GET /jobs/{job_id}` - Get specific job
- `POST /jobs` - Create new job
- `DELETE /jobs/{job_id}` - Delete job
- `PATCH /jobs/{job_id}/status` - Update job status

## Integration with Electron

The Electron app will:

1. Spawn this Python server using `child_process.spawn`
2. Capture the JSON output from stdout containing the port number
3. Save it to `server-info.json` in the user data directory
4. Use the port to make HTTP requests to the API

## Building for Production

For production, you can compile the Python server to a standalone executable using PyInstaller:

```bash
pip install pyinstaller

# Build executable
pyinstaller --onefile --name orchestrator-server orchestrator/server.py
```

The executable will be in `dist/orchestrator-server.exe` (Windows) or `dist/orchestrator-server` (Linux/Mac).

The Electron app will look for this executable in the `resources/server/` directory when packaged.

## Development Notes

- Server listens on `127.0.0.1` only (localhost) for security
- Default port is `8000` but can be overridden via command line: `python -m orchestrator.server 8001`
- All stdout is flushed immediately for Electron to read
- Stderr is used for logging/debugging messages
- Uses in-memory storage (replace with a real database for production)

## Troubleshooting

### Server won't start

- Check if port 8000 is already in use
- Ensure Python 3.8+ is installed
- Verify all dependencies are installed

### Electron can't connect

- Check the Electron console for server startup logs
- Verify `server-info.json` exists in user data directory
- Test the server standalone first
