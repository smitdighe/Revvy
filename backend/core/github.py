import asyncio
import re

from github import Github, GithubException
from config import settings

def parse_pr_url(url: str) -> tuple[str, int]:
    match = re.search(r"github\.com/([^/]+/[^/]+)/pull/(\d+)", url)
    if not match:
        raise ValueError("Invalid GitHub PR URL format")
    return match.group(1), int(match.group(2))

async def fetch_pr_data(pr_url: str, token: str = settings.GITHUB_TOKEN) -> dict:
    repo_full, pr_number = parse_pr_url(pr_url)

    def _fetch() -> dict:
        g = Github(token)
        try:
            repo = g.get_repo(repo_full)
            pr = repo.get_pull(pr_number)

            files = []
            for f in pr.get_files():
                if f.patch is None:
                    continue
                files.append(
                    {
                        "filename": f.filename,
                        "patch": f.patch,
                        "additions": f.additions,
                        "deletions": f.deletions,
                        "status": f.status,
                    }
                )

            return {
                "title": pr.title,
                "description": pr.body or "",
                "author": pr.user.login,
                "base_branch": pr.base.ref,
                "head_branch": pr.head.ref,
                "pr_number": pr.number,
                "total_additions": pr.additions,
                "total_deletions": pr.deletions,
                "files": files,
            }
        except GithubException as exc:
            if exc.status == 401:
                raise ValueError("Invalid GitHub token") from exc
            if exc.status == 403:
                raise ValueError("GitHub rate limit exceeded") from exc
            if exc.status == 404:
                raise ValueError("PR not found or repository is private") from exc
            raise
        finally:
            g.close()

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch)
