import asyncio
import json
import re
from collections.abc import AsyncGenerator

from google import genai
from fastapi import HTTPException

from config import settings
from schemas.request import CodeReviewRequest
from schemas.response import ReviewIssue, ReviewResult, StreamChunk

client = genai.Client(api_key=settings.GEMINI_API_KEY)
MODEL = "gemini-2.0-flash"

SYSTEM_PROMPT = (
    "You are Revvy, a senior code reviewer. "
    "Be direct, precise, surgical. "
    "Flag only real issues with real impact. "
    "No fluff, no praise, no filler.\n\n"
    "You MUST respond with ONLY a raw JSON object (no markdown fences, no explanation) "
    "in this exact structure:\n"
    "{\n"
    '  "issues": [\n'
    "    {\n"
    '      "type": "bug"|"security"|"performance"|"smell"|"style",\n'
    '      "severity": "critical"|"high"|"medium"|"low"|"info",\n'
    '      "line_start": integer or null,\n'
    '      "line_end": integer or null,\n'
    '      "title": "string",\n'
    '      "description": "string",\n'
    '      "suggestion": "string",\n'
    '      "confidence": number between 0 and 1\n'
    "    }\n"
    "  ],\n"
    '  "summary": "string",\n'
    '  "score": integer 0-100,\n'
    '  "verdict": "excellent"|"good"|"needs_work"|"critical"\n'
    "}"
)

def _build_prompt(request: CodeReviewRequest) -> str:
    parts: list[str] = [SYSTEM_PROMPT, ""]
    parts.append(f"Language: {request.language}")
    if request.filename:
        parts.append(f"Filename: {request.filename}")
    if request.focus_areas:
        parts.append(f"Focus areas: {', '.join(request.focus_areas)}")
    parts.append("")
    parts.append(f"```\n{request.code}\n```")
    return "\n".join(parts)

def _strip_markdown_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()

async def review_code(request: CodeReviewRequest, review_id: str) -> ReviewResult:
    prompt = _build_prompt(request)

    loop = asyncio.get_event_loop()
    try:
        response = await loop.run_in_executor(
            None, lambda: client.models.generate_content(model=MODEL, contents=prompt)
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    raw_text = _strip_markdown_fences(response.text)

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502, detail=f"Failed to parse Gemini response: {exc}"
        ) from exc

    issues = [ReviewIssue(**issue) for issue in data.get("issues", [])]

    return ReviewResult(
        review_id=review_id,
        filename=request.filename,
        language=request.language,
        issues=issues,
        summary=data.get("summary", ""),
        score=data.get("score", 0),
        verdict=data.get("verdict", "needs_work"),
    )


async def stream_review(
    request: CodeReviewRequest, review_id: str
) -> AsyncGenerator[StreamChunk, None]:
    yield StreamChunk(
        type="start", data={"review_id": review_id}, review_id=review_id
    )

    try:
        prompt = _build_prompt(request)
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: client.models.generate_content_stream(model=MODEL, contents=prompt)
        )

        json_buffer = ""
        brace_depth = 0
        in_issues_array = False
        object_start = -1
        in_string = False
        escape_next = False

        for chunk in response:
            text = chunk.text or ""
            for ch in text:
                json_buffer += ch

                if escape_next:
                    escape_next = False
                    continue
                if ch == "\\":
                    escape_next = True
                    continue
                if ch == '"':
                    in_string = not in_string
                    continue
                if in_string:
                    continue

                if ch == "[" and not in_issues_array:
                    in_issues_array = True
                    continue

                if in_issues_array:
                    if ch == "{":
                        if brace_depth == 0:
                            object_start = len(json_buffer) - 1
                        brace_depth += 1
                    elif ch == "}":
                        brace_depth -= 1
                        if brace_depth == 0 and object_start >= 0:
                            obj_str = json_buffer[object_start : len(json_buffer)]
                            try:
                                issue_data = json.loads(obj_str)
                                parsed = ReviewIssue(**issue_data)
                                yield StreamChunk(
                                    type="issue",
                                    data=parsed.model_dump(mode="json"),
                                    review_id=review_id,
                                )
                            except (json.JSONDecodeError, Exception):
                                pass
                            object_start = -1
                    elif ch == "]":
                        in_issues_array = False

        # Parse full response for summary fields
        full_text = _strip_markdown_fences(json_buffer)
        try:
            data = json.loads(full_text)
        except json.JSONDecodeError:
            data = {}

        yield StreamChunk(
            type="summary",
            data={
                "summary": data.get("summary", ""),
                "score": data.get("score", 0),
                "verdict": data.get("verdict", "needs_work"),
            },
            review_id=review_id,
        )

        yield StreamChunk(type="done", data={}, review_id=review_id)

    except Exception as exc:
        yield StreamChunk(
            type="error",
            data={"message": str(exc)},
            review_id=review_id,
        )
