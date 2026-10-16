"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_SIGNING_KEY_CHARS = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "local"
    cors_origins: str = "http://localhost:5173"
    openai_api_key: str = ""
    openai_chat_model: str = ""
    proposal_signing_key: str = ""
    chat_rate_limit: str = "20/minute"  # configurable default, per client address
    max_body_bytes: int = 262_144  # request bodies above this are refused before parsing

    @model_validator(mode="after")
    def _signing_key_is_strong(self) -> "Settings":
        if self.proposal_signing_key and len(self.proposal_signing_key) < MIN_SIGNING_KEY_CHARS:
            raise ValueError(f"PROPOSAL_SIGNING_KEY must be at least {MIN_SIGNING_KEY_CHARS} characters")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
