from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID, uuid4
from pydantic import BaseModel, Field

class ReviewIssue(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    type: Literal["bug", "security", "performance", "smell", "style"]
    severity: Literal["critical", "high", "medium", "low", "info"]
    line_start: int | None = None
    line_end: int | None = None
    title: str
    description: str
    suggestion: str
    confidence: float = Field(..., ge=0, le=1)

class ReviewResult(BaseModel):
    review_id: str
    filename: str | None = None
    language: str
    issues: list[ReviewIssue]
    summary: str
    score: int = Field(..., ge=0, le=100)
    verdict: Literal["excellent", "good", "needs_work", "critical"]
    reviewed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    review_time_ms: int | None = None

class StreamChunk(BaseModel):
    type: Literal["start", "issue", "summary", "done", "error"]
    data: Any
    review_id: str
