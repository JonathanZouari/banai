"""Application settings loaded from environment variables."""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "local"
    cors_origins: str = "http://localhost:5173"
    openai_chat_model: str = ""
    openai_transcribe_model: str = ""
    # Spoken replies (ADR-028): empty = pick a speech model from the key's list / the default voice.
    openai_tts_model: str = ""
    openai_tts_voice: str = ""
    # HMAC key for chat proposals; empty = a random key per process (proposals expire on restart).
    proposal_secret: str = ""
    # Saved projects (ADR-042): Supabase, through the backend only (the service key never leaves the server).
    supabase_url: str = ""
    supabase_secret_key: str = ""
    # auto: Supabase when both are set, otherwise off. memory: rows in this process (tests, the E2E server).
    storage: Literal["auto", "memory", "off"] = "auto"
    # Behind exactly one trusted proxy (Railway): count requests against the address it appended to X-Forwarded-For.
    trust_proxy: bool = False

    @field_validator("storage", mode="before")
    @classmethod
    def _blank_storage_is_auto(cls, value):
        return "auto" if isinstance(value, str) and not value.strip() else value

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
