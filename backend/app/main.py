import logging
import time
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from api.routes.health import router as health_router
from api.routes.review import router as review_router
from api.routes.stream import router as stream_router

logger = logging.getLogger("revvy")

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Revvy %s starting, debug=%s", settings.VERSION, settings.DEBUG)
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
    allow_headers=["Content-Type", "X-API-Key"],
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
app.include_router(review_router, prefix="/api/v1")
app.include_router(stream_router, prefix="/api/v1")

@app.get("/")
def root() -> dict:
    return {
        "name": settings.APP_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "health": "/api/v1/health",
    }
