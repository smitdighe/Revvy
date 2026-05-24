"""Rule-based static analysis — always finds real issues in typical bad code."""

import re

from schemas.request import CodeReviewRequest
from schemas.response import ReviewIssue


def _line_for(content: str, snippet: str, fallback: int = 1) -> int:
    index = content.lower().find(snippet.lower())
    if index < 0:
        return fallback
    return content[:index].count("\n") + 1


def _line_matches(pattern: str, line: str) -> bool:
    return re.search(pattern, line, re.IGNORECASE) is not None


def _area_enabled(areas: set[str], issue_type: str) -> bool:
    if issue_type in ("bug", "smell"):
        return "bugs" in areas
    return issue_type in areas


def static_analyze(code: str, focus_areas: list[str] | None) -> list[ReviewIssue]:
    areas = set(focus_areas or ["bugs", "security", "performance", "style"])
    issues: list[ReviewIssue] = []
    lines = code.split("\n")

    def add(
        issue_type: str,
        severity: str,
        title: str,
        description: str,
        suggestion: str,
        line: int,
        confidence: float = 0.88,
    ) -> None:
        if not _area_enabled(areas, issue_type):
            return
        issues.append(
            ReviewIssue(
                type=issue_type,  # type: ignore[arg-type]
                severity=severity,  # type: ignore[arg-type]
                line_start=line,
                line_end=line,
                title=title,
                description=description,
                suggestion=suggestion,
                confidence=confidence,
            )
        )

    # --- Whole-file patterns ---
    if "eval(" in code:
        add(
            "bug",
            "critical",
            "Unsafe eval()",
            "eval() executes arbitrary strings and is a critical security risk.",
            "Remove eval; use JSON.parse, a safe DSL, or server-side validation.",
            _line_for(code, "eval("),
            0.97,
        )

    if re.search(r"innerHTML\s*=", code):
        add(
            "security",
            "high",
            "DOM XSS via innerHTML",
            "Assigning unsanitized HTML enables cross-site scripting.",
            "Use textContent, sanitize HTML, or a trusted templating library.",
            _line_for(code, "innerHTML"),
            0.93,
        )

    if "document.write" in code:
        add(
            "security",
            "medium",
            "document.write usage",
            "document.write can be abused for XSS and blocks parsing.",
            "Use DOM APIs (createElement, append) instead.",
            _line_for(code, "document.write"),
            0.85,
        )

    if re.search(r"(password|api[_-]?key|secret)\s*=\s*['\"][^'\"]+['\"]", code, re.I):
        add(
            "security",
            "critical",
            "Hardcoded secret",
            "Credentials or API keys are embedded in source code.",
            "Move secrets to environment variables or a secret manager.",
            _line_for(code, "="),
            0.94,
        )

    if "localStorage" in code and re.search(r"token|password|secret|session", code, re.I):
        add(
            "security",
            "high",
            "Sensitive data in localStorage",
            "Browser storage is readable by any script on the page (XSS risk).",
            "Use httpOnly cookies or secure server-side sessions.",
            _line_for(code, "localStorage"),
            0.91,
        )

    if "fetch(" in code and "response.ok" not in code and "response.status" not in code:
        add(
            "bug",
            "medium",
            "Missing HTTP status check",
            "fetch() resolves on network success even for 4xx/5xx responses.",
            "Check response.ok or response.status before reading the body.",
            _line_for(code, "fetch("),
            0.9,
        )

    if "forEach(async" in code or "forEach( async" in code:
        add(
            "bug",
            "high",
            "async forEach",
            "forEach ignores returned promises; async callbacks are not awaited.",
            "Use for...of with await or Promise.all(items.map(...)).",
            _line_for(code, "forEach"),
            0.92,
        )

    if "setInterval" in code and "clearInterval" not in code:
        add(
            "performance",
            "medium",
            "Interval leak",
            "setInterval is never cleared, causing memory leaks and duplicate work.",
            "Store the timer id and call clearInterval in cleanup/unmount.",
            _line_for(code, "setInterval"),
            0.88,
        )

    if re.search(r"catch\s*\([^)]*\)\s*\{\s*\}", code):
        add(
            "bug",
            "high",
            "Empty catch block",
            "Errors are swallowed silently, hiding failures.",
            "Log the error, rethrow, or return a typed error result.",
            _line_for(code, "catch"),
            0.9,
        )

    if "JSON.parse" in code and "try" not in code[max(0, code.find("JSON.parse") - 80) : code.find("JSON.parse")]:
        add(
            "bug",
            "medium",
            "JSON.parse without try/catch",
            "Invalid JSON will throw and can crash the request path.",
            "Wrap JSON.parse in try/catch or use a safe parse helper.",
            _line_for(code, "JSON.parse"),
            0.86,
        )

    if re.search(r"\bvar\s+\w+", code):
        add(
            "smell",
            "low",
            "Use of var",
            "var is function-scoped and can cause subtle bugs.",
            "Use const by default or let when reassignment is required.",
            _line_for(code, "var "),
            0.8,
        )

    # --- Per-line patterns ---
    for i, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("//") or stripped.startswith("#"):
            continue

        if re.search(r"(?<![=!])==(?![=])", line) and "===" not in line and "==" in line:
            add(
                "bug",
                "medium",
                "Loose equality (==)",
                "== performs type coercion and often hides bugs.",
                "Use === and !== for strict comparison.",
                i,
                0.87,
            )

        if re.search(r"parseInt\s*\([^,)]+\)", line) and "parseInt" in line:
            if ", 10)" not in line and ",10)" not in line and ", 16)" not in line:
                add(
                    "bug",
                    "low",
                    "parseInt without radix",
                    "parseInt without a radix can parse octal/hex unexpectedly.",
                    "Pass radix 10: parseInt(value, 10).",
                    i,
                    0.82,
                )

        if re.search(r"\.then\s*\(", line) and ".catch" not in code:
            add(
                "bug",
                "medium",
                "Unhandled promise chain",
                "A .then() chain without .catch() leaves rejections unhandled.",
                "Add .catch() or use async/await with try/catch.",
                i,
                0.84,
            )

        if re.search(r"\bawait\s+\w+", line):
            fn_ctx = code[max(0, code.rfind("function", 0, code.find(line))): code.find(line)]
            if "async" not in fn_ctx[-120:]:
                add(
                    "bug",
                    "high",
                    "await outside async function",
                    "await is only valid inside async functions.",
                    "Mark the containing function async or remove await.",
                    i,
                    0.9,
                )

        if re.search(r"(SELECT|INSERT|UPDATE|DELETE).*\+.*['\"]", line, re.I):
            add(
                "security",
                "critical",
                "SQL injection risk",
                "SQL built with string concatenation allows injection.",
                "Use parameterized queries / prepared statements.",
                i,
                0.95,
            )

        if "console.log" in line:
            add(
                "style",
                "low",
                "Debug console.log",
                "Debug logging should not ship in production paths.",
                "Remove or gate behind a debug flag / structured logger.",
                i,
                0.75,
            )

        if re.search(r":\s*any\b", line) or re.search(r"\bas\s+any\b", line):
            add(
                "smell",
                "low",
                "Explicit any type",
                "'any' disables type safety and hides bugs.",
                "Use a precise type, unknown, or a generic constraint.",
                i,
                0.78,
            )

        if len(line) > 96:
            add(
                "style",
                "low",
                "Line too long",
                f"Line {i} exceeds 96 characters and hurts readability.",
                "Break the expression across lines or extract variables.",
                i,
                0.7,
            )

        if re.search(r"TODO|FIXME|HACK|XXX", line, re.I):
            add(
                "smell",
                "info",
                "Unresolved TODO/FIXME",
                "Tracked work items remain in production code.",
                "Resolve, ticket, or remove before merge.",
                i,
                0.72,
            )

    # Deduplicate by title + line
    seen: set[tuple[str, int]] = set()
    unique: list[ReviewIssue] = []
    for issue in issues:
        key = (issue.title, issue.line_start or 0)
        if key in seen:
            continue
        seen.add(key)
        unique.append(issue)

    return unique


def ensure_minimum_findings(
    issues: list[ReviewIssue], code: str, focus_areas: list[str] | None
) -> list[ReviewIssue]:
    """Never return completely empty — always suggest improvements."""
    if issues:
        return issues

    areas = set(focus_areas or ["bugs", "security", "performance", "style"])
    baseline: list[ReviewIssue] = []

    if not code.strip():
        return baseline

    if "bugs" in areas:
        baseline.append(
            ReviewIssue(
                type="smell",
                severity="info",
                line_start=1,
                line_end=1,
                title="Validate inputs and edge cases",
                description="No obvious bugs matched static rules; manually verify null/empty inputs and error paths.",
                suggestion="Add guards for empty input, boundary values, and failure branches.",
                confidence=0.65,
            )
        )
    if "security" in areas:
        baseline.append(
            ReviewIssue(
                type="security",
                severity="info",
                line_start=1,
                line_end=1,
                title="Security pass recommended",
                description="Run a dedicated security review for auth, injection, and data exposure.",
                suggestion="Audit user-controlled input, secrets handling, and access control.",
                confidence=0.6,
            )
        )

    return baseline


def score_from_issues(issues: list[ReviewIssue]) -> int:
    penalty = 0
    for issue in issues:
        if issue.severity == "critical":
            penalty += 24
        elif issue.severity == "high":
            penalty += 15
        elif issue.severity == "medium":
            penalty += 8
        elif issue.severity == "low":
            penalty += 4
        else:
            penalty += 2
    return max(38, 96 - penalty)


def verdict_from_score(score: int, issues: list[ReviewIssue]) -> str:
    if any(i.severity == "critical" for i in issues):
        return "critical"
    if score >= 85 and not any(i.severity in ("high", "critical") for i in issues):
        return "excellent"
    if score >= 70:
        return "good"
    if score >= 50:
        return "needs_work"
    return "critical"


def build_result_from_issues(
    request: CodeReviewRequest, review_id: str, issues: list[ReviewIssue], summary_prefix: str = ""
) -> "ReviewResult":
    from schemas.response import ReviewResult

    issues = ensure_minimum_findings(issues, request.code, request.focus_areas)
    score = score_from_issues(issues)
    verdict = verdict_from_score(score, issues)

    summary = (
        f"{summary_prefix}Found {len(issues)} issue(s) requiring attention. "
        "Review each finding and address by severity."
        if issues
        else "Analysis complete."
    )

    return ReviewResult(
        review_id=review_id,
        filename=request.filename,
        language=request.language,
        issues=issues,
        summary=summary.strip(),
        score=score,
        verdict=verdict,  # type: ignore[arg-type]
    )
