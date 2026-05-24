import asyncio
import re

from github import Github, GithubException

from config import settings


def normalize_pr_url(url: str) -> str:
    url = url.strip()
    if not url.startswith("http"):
        url = f"https://{url}"
    return url


def parse_pr_url(url: str) -> tuple[str, int]:
    normalized = normalize_pr_url(url)
    match = re.search(r"github\.com/([^/]+/[^/]+)/pull/(\d+)", normalized)
    if not match:
        raise ValueError(
            "Invalid GitHub PR URL. Use: https://github.com/owner/repo/pull/123"
        )
    return match.group(1), int(match.group(2))


def _github_client(token: str) -> Github:
    token = (token or "").strip()
    if token:
        return Github(token)
    return Github()


async def fetch_pr_data(pr_url: str, token: str | None = None) -> dict:
    repo_full, pr_number = parse_pr_url(pr_url)
    effective_token = (token if token is not None else settings.GITHUB_TOKEN) or ""

    def _fetch() -> dict:
        g = _github_client(effective_token)
        try:
            repo = g.get_repo(repo_full)
            pr = repo.get_pull(pr_number)

            files: list[dict] = []
            for f in pr.get_files():
                files.append(
                    {
                        "filename": f.filename,
                        "patch": f.patch,
                        "additions": f.additions,
                        "deletions": f.deletions,
                        "status": f.status,
                        "previous_filename": getattr(f, "previous_filename", None),
                    }
                )

            return {
                "repo": repo_full,
                "title": pr.title,
                "description": pr.body or "",
                "author": pr.user.login if pr.user else "unknown",
                "html_url": pr.html_url,
                "state": pr.state,
                "base_branch": pr.base.ref,
                "head_branch": pr.head.ref,
                "pr_number": pr.number,
                "total_additions": pr.additions,
                "total_deletions": pr.deletions,
                "changed_files": pr.changed_files,
                "files": files,
                "token_used": bool(effective_token),
            }
        except GithubException as exc:
            if exc.status == 401:
                raise ValueError(
                    "GitHub authentication failed. Set GITHUB_TOKEN in backend/.env "
                    "or paste a token in Settings."
                ) from exc
            if exc.status == 403:
                msg = str(exc.data) if exc.data else ""
                if "rate limit" in msg.lower():
                    raise ValueError(
                        "GitHub API rate limit exceeded. Add GITHUB_TOKEN for higher limits."
                    ) from exc
                raise ValueError(
                    "GitHub access denied (403). This repo may be private — add GITHUB_TOKEN."
                ) from exc
            if exc.status == 404:
                raise ValueError(
                    "Pull request not found. Check the URL and that the repo is public "
                    "or provide GITHUB_TOKEN for private repos."
                ) from exc
            raise ValueError(f"GitHub API error ({exc.status})") from exc
        finally:
            g.close()

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _fetch)


async def check_github_connection(token: str | None = None) -> dict:
    effective_token = (token if token is not None else settings.GITHUB_TOKEN) or ""

    def _check() -> dict:
        g = _github_client(effective_token)
        try:
            if effective_token:
                user = g.get_user()
                return {
                    "configured": True,
                    "authenticated": True,
                    "username": user.login,
                    "rate_limit_hint": "5,000 requests/hour with token",
                }
            rate = g.get_rate_limit()
            core = rate.core
            return {
                "configured": False,
                "authenticated": False,
                "username": None,
                "rate_limit_hint": f"{core.remaining}/{core.limit} requests/hour (unauthenticated)",
            }
        except GithubException as exc:
            if exc.status == 401:
                return {
                    "configured": True,
                    "authenticated": False,
                    "username": None,
                    "rate_limit_hint": "Invalid token — update GITHUB_TOKEN or Settings",
                }
            raise
        finally:
            g.close()

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _check)
