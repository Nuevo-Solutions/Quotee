from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AI Inbox-to-Quote API"
    api_v1_prefix: str = "/api/v1"
    environment: str = "local"
    database_url: str = (
        "postgresql+asyncpg://postgres:local_dev_only@localhost:5432/ai_inbox_to_quote"
    )
    document_storage_path: Path = Path(".data/documents")
    max_document_size_bytes: int = 20 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
