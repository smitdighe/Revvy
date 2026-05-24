from schemas.request import CodeReviewRequest
from schemas.response import ReviewResult
from core.static_analysis import build_result_from_issues, static_analyze


def mock_review_code(request: CodeReviewRequest, review_id: str) -> ReviewResult:
    issues = static_analyze(request.code, request.focus_areas)
    return build_result_from_issues(
        request,
        review_id,
        issues,
        summary_prefix="Static analysis (add GEMINI_API_KEY for AI review). ",
    )
