"""
FastAPI main application entry point.
"""

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .routers import sessions, hierarchy, waveform, files
from .config import settings
from .logging_config import setup_logging, get_logger
from .middleware import RequestLoggingMiddleware

# Initialize logging
setup_logging(
    log_to_file=settings.log_to_file,
    log_to_console=True,
    json_format=False
)

logger = get_logger(__name__)

app = FastAPI(
    title="Wave Browser API",
    description="API for browsing RTL design hierarchy and viewing waveforms",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add request logging middleware
app.add_middleware(RequestLoggingMiddleware)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions and log them."""
    logger.error(
        f"Unhandled exception: {type(exc).__name__}: {str(exc)}",
        extra={"path": request.url.path, "method": request.method},
        exc_info=True
    )
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}"}
    )


# Include routers
app.include_router(sessions.router, prefix="/api/sessions", tags=["Sessions"])
app.include_router(hierarchy.router, prefix="/api/hierarchy", tags=["Hierarchy"])
app.include_router(waveform.router, prefix="/api/waveform", tags=["Waveform"])
app.include_router(files.router, prefix="/api/files", tags=["Files"])


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


def _frontend_dist() -> Path:
    return Path(settings.frontend_static_dir)


def _should_serve_frontend() -> bool:
    return settings.serve_frontend and _frontend_dist().is_dir()


@app.get("/")
async def root():
    """Serve the SPA or API info when the frontend bundle is unavailable."""
    index = _frontend_dist() / "index.html"
    if _should_serve_frontend() and index.is_file():
        return FileResponse(index)
    return {
        "name": "Wave Browser API",
        "version": "0.1.0",
        "docs": "/docs",
        "hint": "Run scripts/wave-browser.sh build to enable the web UI at /",
    }


def mount_frontend() -> None:
    """Mount static assets for the production frontend bundle."""
    static_dir = _frontend_dist()
    if not _should_serve_frontend():
        logger.warning(
            "Frontend bundle not found at %s — API-only mode. "
            "Run: scripts/wave-browser.sh build",
            static_dir,
        )
        return

    assets_dir = static_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend-assets")

    @app.get("/{file_path:path}")
    async def serve_frontend(file_path: str):
        if file_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})

        candidate = static_dir / file_path
        if candidate.is_file():
            return FileResponse(candidate)

        index = static_dir / "index.html"
        if index.is_file():
            return FileResponse(index)

        return JSONResponse(status_code=404, content={"detail": "Not found"})

    logger.info("Serving frontend from %s", static_dir)


mount_frontend()
