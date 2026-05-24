import logging
import time
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from config import settings
from api.routes.github import router as github_router
from api.routes.health import router as health_router
from api.routes.review import router as review_router
from api.routes.stream import router as stream_router

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"

logger = logging.getLogger("revvy")

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Revvy %s starting, debug=%s", settings.VERSION, settings.DEBUG)
    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY missing — using static analysis for code review")
    if not settings.GITHUB_TOKEN:
        logger.warning("GITHUB_TOKEN missing — public repos only, lower rate limits")
    yield

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Your AI pair programmer for every PR.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key", "X-GitHub-Token"],
)

@app.middleware("http")
async def process_time_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = int((time.perf_counter() - start) * 1000)
    logger.info(
        "%s %s %s %dms",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    response.headers["X-Process-Time-Ms"] = str(duration_ms)
    return response

app.include_router(health_router, prefix="/api/v1")
app.include_router(github_router, prefix="/api/v1")
app.include_router(review_router, prefix="/api/v1")
app.include_router(stream_router, prefix="/api/v1")


def _mount_frontend() -> None:
    if not FRONTEND_DIST.is_dir():
        return

    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/", include_in_schema=False)
    async def serve_index() -> FileResponse:
        return FileResponse(FRONTEND_DIST / "index.html")

    @app.get("/{path:path}", include_in_schema=False)
    async def serve_spa(path: str) -> FileResponse:
        if path.startswith("api") or path in ("docs", "openapi.json", "redoc"):
            raise HTTPException(status_code=404, detail="Not found")
        file_path = FRONTEND_DIST / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIST / "index.html")


if FRONTEND_DIST.is_dir():
    _mount_frontend()
else:

    @app.get("/")
    def api_root() -> dict:
        return {
            "name": settings.APP_NAME,
            "version": settings.VERSION,
            "docs": "/docs",
            "health": "/api/v1/health",
            "hint": "Run `npm run build` in frontend/ then restart for the web UI at this URL.",
        }
