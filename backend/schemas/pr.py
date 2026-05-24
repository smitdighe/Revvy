from pydantic import BaseModel


class PRFileInfo(BaseModel):
    path: str
    additions: int
    deletions: int
    status: str
    patch: str | None = None
    previous_filename: str | None = None


class PRInfo(BaseModel):
    repo: str
    number: int
    title: str
    author: str
    html_url: str
    state: str
    base_branch: str
    head_branch: str
    description: str
    additions: int
    deletions: int
    changed_files: int


class PRDetailsResponse(BaseModel):
    pr: PRInfo
    files: list[PRFileInfo]
    github: dict
