from fastapi import APIRouter, Depends

from api.dependencies import get_github_token
from core import github as github_core

router = APIRouter(prefix="/github", tags=["github"])


@router.get("/status")
async def github_status(token: str = Depends(get_github_token)) -> dict:
    status = await github_core.check_github_connection(token)
    status["env_token"] = bool(token)
    return status
