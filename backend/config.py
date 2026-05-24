from pydantic_settings import BaseSettings

class Settings(BaseSettings):

    GEMINI_API_KEY: str
    GITHUB_TOKEN: str = ""
    APP_NAME: str = "Revvy"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    MAX_CODE_LENGTH: int = 50000
    RATE_LIMIT_PER_MINUTE: int = 10
    API_KEY: str = ""
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173"]

    model_config = {"env_file": ".env"}

settings = Settings()
