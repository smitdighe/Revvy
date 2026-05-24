import asyncio
import json
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse
from api.dependencies import get_review_id, rate_limit
from core import reviewer
from schemas.request import CodeReviewRequest

router = APIRouter(prefix="/stream", tags=["stream"])

KEEPALIVE_TIMEOUT = 15

@router.post("/code")
async def stream_code_review(
    request: CodeReviewRequest,
    review_id: str = Depends(get_review_id),
    _rl: None = Depends(rate_limit),
) -> EventSourceResponse:
    async def event_generator() -> AsyncGenerator[dict, None]:
        try:
            stream = reviewer.stream_review(request, review_id)
            chunk_iter = stream.__aiter__()

            while True:
                try:
                    chunk = await asyncio.wait_for(
                        chunk_iter.__anext__(), timeout=KEEPALIVE_TIMEOUT
                    )
                    yield {
                        "event": chunk.type,
                        "data": chunk.model_dump_json(),
                    }
                    if chunk.type == "done":
                        break
                except asyncio.TimeoutError:
                    yield {"comment": "keepalive"}
                except StopAsyncIteration:
                    break
        except Exception as exc:
            yield {
                "event": "error",
                "data": json.dumps({"message": str(exc)}),
            }
            yield {"event": "done", "data": "{}"}

    return EventSourceResponse(
        event_generator(),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
