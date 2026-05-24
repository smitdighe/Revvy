import re
from typing import Literal
from pydantic import BaseModel, Field, field_validator
from config import settings

FocusArea = Literal["bugs", "security", "performance", "style"]

class CodeReviewRequest(BaseModel):
    code: str = Field(..., strip_whitespace=True, max_length=settings.MAX_CODE_LENGTH)
    language: str = "auto"
    filename: str | None = None
    focus_areas: list[FocusArea] | None = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "code": "def add(a, b):\n    return a + b",
                    "language": "python",
                    "filename": "utils.py",
                    "focus_areas": ["bugs", "performance"],
                }
            ]
        }
    }


class PRReviewRequest(BaseModel):
    pr_url: str
    focus_areas: list[FocusArea] | None = None

    @field_validator("pr_url")
    @classmethod
    def validate_pr_url(cls, v: str) -> str:
        if not re.search(r"github\.com/.+/.+/pull/\d+", v):
            raise ValueError("Invalid GitHub PR URL")
        return v

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "pr_url": "https://github.com/octocat/hello-world/pull/42",
                    "focus_areas": ["security", "style"],
                }
            ]
        }
    }
