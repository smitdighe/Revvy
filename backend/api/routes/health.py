from datetime import datetime
from fastapi import APIRouter
from config import settings

MODULE_START_TIME = datetime.utcnow()

router = APIRouter(prefix="/health", tags=["health"])

@router.get("/")
def health_check() -> dict:
    now = datetime.utcnow()
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.VERSION,
        "uptime_seconds": int((now - MODULE_START_TIME).total_seconds()),
        "timestamp": now.isoformat(),
    }

@router.get("/ping")
def ping() -> dict:
    return {"pong": True}
