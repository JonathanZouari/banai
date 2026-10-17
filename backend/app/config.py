"""Application settings loaded from environment variables."""

from functools import lru_cache

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

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
