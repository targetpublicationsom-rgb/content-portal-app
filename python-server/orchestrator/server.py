"""
FastAPI Server for Electron Integration
This server starts FastAPI using uvicorn and prints port information to stdout as JSON.
The Electron app will capture this output to know which port to connect to.
"""

import sys
import json
import asyncio
from typing import List, Dict, Any
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn


# ============================================================================
# Data Models
# ============================================================================

class Job(BaseModel):
    """Job model"""
    id: str
    name: str
    description: str = ""
    status: str = "pending"
    created_at: str


class JobCreate(BaseModel):
    """Model for creating a new job"""
    name: str
    description: str = ""


# ============================================================================
# In-Memory Database (Replace with real DB in production)
# ============================================================================

jobs_db: List[Job] = []


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(
    title="Orchestrator API",
    description="Backend API for Content Portal",
    version="1.0.0"
)

# Add CORS middleware to allow Electron renderer to make requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint
    Returns the server status
    """
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "service": "orchestrator-server"
    }


@app.get("/jobs")
async def get_jobs() -> Dict[str, List[Job]]:
    """
    Get all jobs
    """
    return {"jobs": jobs_db}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str) -> Job:
    """
    Get a specific job by ID
    """
    for job in jobs_db:
        if job.id == job_id:
            return job
    
    raise HTTPException(status_code=404, detail=f"Job {job_id} not found")


@app.post("/jobs")
async def create_job(job_data: JobCreate) -> Job:
    """
    Create a new job
    """
    import uuid
    
    job = Job(
        id=str(uuid.uuid4()),
        name=job_data.name,
        description=job_data.description,
        status="pending",
        created_at=datetime.now().isoformat()
    )
    
    jobs_db.append(job)
    return job


@app.delete("/jobs/{job_id}")
async def delete_job(job_id: str) -> Dict[str, str]:
    """
    Delete a job by ID
    """
    global jobs_db
    
    for i, job in enumerate(jobs_db):
        if job.id == job_id:
            jobs_db.pop(i)
            return {"message": f"Job {job_id} deleted"}
    
    raise HTTPException(status_code=404, detail=f"Job {job_id} not found")


@app.patch("/jobs/{job_id}/status")
async def update_job_status(job_id: str, status: str) -> Job:
    """
    Update job status
    """
    for job in jobs_db:
        if job.id == job_id:
            job.status = status
            return job
    
    raise HTTPException(status_code=404, detail=f"Job {job_id} not found")


# ============================================================================
# Server Startup
# ============================================================================

def print_server_info(port: int) -> None:
    """
    Print server information as JSON to stdout.
    This will be captured by the Electron app.
    IMPORTANT: Flush stdout immediately so Electron can read it.
    """
    server_info = {"port": port}
    print(json.dumps(server_info), flush=True)
    
    # Also print to stderr for debugging (won't interfere with JSON parsing)
    print(f"[Server] Started on port {port}", file=sys.stderr, flush=True)


async def run_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    """
    Run the FastAPI server using uvicorn
    """
    config = uvicorn.Config(
        app=app,
        host=host,
        port=port,
        log_level="info",
        access_log=True
    )
    
    server = uvicorn.Server(config)
    
    # Print port info before starting server
    print_server_info(port)
    
    # Start server
    await server.serve()


def main() -> None:
    """
    Main entry point
    """
    # Configuration
    HOST = "127.0.0.1"  # Localhost only for security
    PORT = 8000         # Default port (can be made configurable)
    
    # Check if port is provided as command line argument
    if len(sys.argv) > 1:
        try:
            PORT = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port number: {sys.argv[1]}", file=sys.stderr)
            sys.exit(1)
    
    # Run the server
    try:
        asyncio.run(run_server(HOST, PORT))
    except KeyboardInterrupt:
        print("\n[Server] Shutting down...", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"[Server] Error: {e}", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
