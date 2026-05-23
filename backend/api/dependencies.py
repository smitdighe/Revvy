import time
from uuid import uuid4
from fastapi import Header, HTTPException, Request
from config import settings

_rate_limit_store: dict[str, list[float]] = {}

def rate_limit(request: Request) -> None:
    ip = request.client.host
    now = time.time()
    window = 60.0
    timestamps = _rate_limit_store.get(ip, [])
    timestamps = [t for t in timestamps if now - t < window]

    if len(timestamps) >= settings.RATE_LIMIT_PER_MINUTE:
        oldest = min(timestamps)
        retry_after = int(window - (now - oldest)) + 1
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )

    timestamps.append(now)
    _rate_limit_store[ip] = timestamps

def get_review_id() -> str:
    return str(uuid4())

def verify_api_key(x_api_key: str = Header(default=None)) -> None:
    if not settings.API_KEY:
        return
    if x_api_key is None or x_api_key != settings.API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
