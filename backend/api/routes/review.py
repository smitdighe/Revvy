from collections import OrderedDict
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import PlainTextResponse
from api.dependencies import get_review_id, rate_limit, verify_api_key
from config import settings
from core import github, reviewer
from core.parser import extract_language
from schemas.request import CodeReviewRequest, PRReviewRequest
from schemas.response import ReviewResult
from utils.markdown import review_to_markdown
from utils.timer import add_timing_header, timed_review
from schemas.response import PRFilesResult

REVIEW_STORE: OrderedDict[str, ReviewResult] = OrderedDict()
MAX_STORE_SIZE = 100

router = APIRouter(prefix="/review", tags=["review"])

def _store_result(review_id: str, result: ReviewResult) -> None:
    REVIEW_STORE[review_id] = result
    while len(REVIEW_STORE) > MAX_STORE_SIZE:
        REVIEW_STORE.popitem(last=False)

@router.post("/code", response_model=ReviewResult)
async def review_code(
    request: CodeReviewRequest,
    response: Response,
    review_id: str = Depends(get_review_id),
    _rl: None = Depends(rate_limit),
    _auth: None = Depends(verify_api_key),
) -> ReviewResult:
    result, elapsed_ms = await timed_review(
        reviewer.review_code(request, review_id)
    )
    result.review_time_ms = elapsed_ms
    _store_result(review_id, result)
    add_timing_header(response, elapsed_ms)
    return result

@router.post("/pr", response_model=ReviewResult)
async def review_pr(
    request: PRReviewRequest,
    response: Response,
    review_id: str = Depends(get_review_id),
    _rl: None = Depends(rate_limit),
    _auth: None = Depends(verify_api_key),
) -> ReviewResult:
    try:
        pr_data = await github.fetch_pr_data(request.pr_url, settings.GITHUB_TOKEN)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    files = pr_data.get("files", [])
    parts = [f"# {f['filename']}\n{f['patch']}" for f in files]
    combined_code = "\n\n".join(parts)

    language = extract_language(files[0]["filename"]) if files else "auto"

    code_request = CodeReviewRequest(
        code=combined_code,
        language=language,
        focus_areas=request.focus_areas,
    )

    result, elapsed_ms = await timed_review(
        reviewer.review_code(code_request, review_id)
    )
    result.review_time_ms = elapsed_ms
    _store_result(review_id, result)
    add_timing_header(response, elapsed_ms)
    return result

@router.post("/pr/files")
async def get_pr_files(
    request: PRReviewRequest,
    _rl: None = Depends(rate_limit),
    _auth: None = Depends(verify_api_key),
) -> dict:
    try:
        pr_data = await github.fetch_pr_data(request.pr_url, settings.GITHUB_TOKEN)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    files = pr_data.get("files", [])
    return {
        "files": [
            {
                "path": f["filename"],
                "additions": f["additions"],
                "deletions": f["deletions"],
                "status": f["status"],
            }
            for f in files
        ]
    }

@router.get("/{review_id}/export")
async def export_review(review_id: str) -> PlainTextResponse:
    result = REVIEW_STORE.get(review_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Review not found")

    md = review_to_markdown(result)
    return PlainTextResponse(
        content=md,
        media_type="text/markdown",
        headers={
            "Content-Disposition": f'attachment; filename="revvy-review-{review_id[:8]}.md"',
        },
    )
