from collections import OrderedDict
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import PlainTextResponse
from api.dependencies import get_github_token, get_review_id, rate_limit, verify_api_key
from config import settings
from core import github, reviewer
from core.parser import extract_language, truncate_code
from schemas.pr import PRDetailsResponse, PRFileInfo, PRInfo
from schemas.request import CodeReviewRequest, PRReviewRequest
from schemas.response import ReviewResult
from utils.markdown import review_to_markdown
from utils.timer import add_timing_header, timed_review

REVIEW_STORE: OrderedDict[str, ReviewResult] = OrderedDict()
MAX_STORE_SIZE = 100

router = APIRouter(prefix="/review", tags=["review"])


def _pr_details_from_data(pr_data: dict, gh_status: dict) -> PRDetailsResponse:
    return PRDetailsResponse(
        pr=PRInfo(
            repo=pr_data["repo"],
            number=pr_data["pr_number"],
            title=pr_data["title"],
            author=pr_data["author"],
            html_url=pr_data["html_url"],
            state=pr_data["state"],
            base_branch=pr_data["base_branch"],
            head_branch=pr_data["head_branch"],
            description=pr_data["description"],
            additions=pr_data["total_additions"],
            deletions=pr_data["total_deletions"],
            changed_files=pr_data["changed_files"],
        ),
        files=[
            PRFileInfo(
                path=f["filename"],
                additions=f["additions"],
                deletions=f["deletions"],
                status=f["status"],
                patch=f.get("patch"),
                previous_filename=f.get("previous_filename"),
            )
            for f in pr_data.get("files", [])
        ],
        github=gh_status,
    )


def _combined_diff(files: list[dict]) -> str:
    parts: list[str] = []
    for f in files:
        patch = f.get("patch")
        if not patch:
            parts.append(f"# {f['filename']} ({f.get('status', 'changed')}, no patch — binary or too large)")
            continue
        parts.append(f"# {f['filename']}\n{patch}")
    return "\n\n".join(parts)


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
    github_token: str = Depends(get_github_token),
    _rl: None = Depends(rate_limit),
    _auth: None = Depends(verify_api_key),
) -> ReviewResult:
    try:
        pr_data = await github.fetch_pr_data(request.pr_url, github_token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    files = [f for f in pr_data.get("files", []) if f.get("patch")]
    if not files:
        raise HTTPException(
            status_code=400,
            detail="No reviewable diffs in this PR (binary-only or empty changes).",
        )

    combined_code = truncate_code(_combined_diff(files), settings.MAX_CODE_LENGTH)
    language = extract_language(files[0]["filename"]) if files else "auto"

    code_request = CodeReviewRequest(
        code=combined_code,
        language=language,
        filename=f"PR #{pr_data['pr_number']} — {pr_data['repo']}",
        focus_areas=request.focus_areas,
    )

    result, elapsed_ms = await timed_review(
        reviewer.review_code(code_request, review_id)
    )
    result.review_time_ms = elapsed_ms
    result.summary = f"[{pr_data['title']}] {result.summary}"
    _store_result(review_id, result)
    add_timing_header(response, elapsed_ms)
    return result


@router.post("/pr/details", response_model=PRDetailsResponse)
async def get_pr_details(
    request: PRReviewRequest,
    github_token: str = Depends(get_github_token),
    _rl: None = Depends(rate_limit),
    _auth: None = Depends(verify_api_key),
) -> PRDetailsResponse:
    try:
        pr_data = await github.fetch_pr_data(request.pr_url, github_token)
        gh_status = await github.check_github_connection(github_token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _pr_details_from_data(pr_data, gh_status)


@router.post("/pr/files", response_model=PRDetailsResponse)
async def get_pr_files(
    request: PRReviewRequest,
    github_token: str = Depends(get_github_token),
    _rl: None = Depends(rate_limit),
    _auth: None = Depends(verify_api_key),
) -> PRDetailsResponse:
    """Alias for /pr/details (backwards compatible)."""
    try:
        pr_data = await github.fetch_pr_data(request.pr_url, github_token)
        gh_status = await github.check_github_connection(github_token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _pr_details_from_data(pr_data, gh_status)

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
