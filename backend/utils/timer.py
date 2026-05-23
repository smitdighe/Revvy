import time
from typing import Any, Awaitable
from fastapi import Response

class ReviewTimer:
    def __enter__(self) -> "ReviewTimer":
        self._start = time.perf_counter()
        self.elapsed_ms: int = 0
        return self

    def __exit__(self, *exc: object) -> None:
        self.elapsed_ms = int((time.perf_counter() - self._start) * 1000)

def add_timing_header(response: Response, elapsed_ms: int) -> None:
    response.headers["X-Review-Time-Ms"] = str(elapsed_ms)

async def timed_review(coro: Awaitable) -> tuple[Any, int]:
    start = time.perf_counter()
    result = await coro
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    return result, elapsed_ms
