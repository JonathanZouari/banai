"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_SIGNING_KEY_CHARS = 32
# ASSUMPTION: a configurable default; override with OPENAI_CHAT_MODEL per environment.
DEFAULT_CHAT_MODEL = "gpt-5.4-mini"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "local"
    cors_origins: str = "http://localhost:5173"
    openai_api_key: str = ""
    openai_chat_model: str = ""
    openai_temperature: float | None = 0.2  # configurable default (a number; None omits it for models that reject it)
    proposal_signing_key: str = ""
    # Voice chat (configurable defaults, not business rules): speech-to-text, text-to-speech, voice.
    openai_transcribe_model: str = "gpt-4o-mini-transcribe"
    openai_tts_model: str = "gpt-4o-mini-tts"
    openai_tts_voice: str = "marin"  # measured as the clearest for Hebrew
    voice_rate_limit: str = "30/minute"
    max_audio_bytes: int = 1_000_000  # about 30 s of compressed speech
    chat_rate_limit: str = "20/minute"  # configurable default, per client address
    max_body_bytes: int = 262_144  # request bodies above this are refused before parsing

    @model_validator(mode="after")
    def _signing_key_is_strong(self) -> "Settings":
        if self.proposal_signing_key and len(self.proposal_signing_key) < MIN_SIGNING_KEY_CHARS:
            raise ValueError(f"PROPOSAL_SIGNING_KEY must be at least {MIN_SIGNING_KEY_CHARS} characters")
        return self

    @property
    def chat_model(self) -> str:
        return self.openai_chat_model.strip() or DEFAULT_CHAT_MODEL

    @property
    def chat_temperature(self) -> float | None:
        # The temperature default only applies to a model chosen on purpose: the fallback model may reject it.
        return self.openai_temperature if self.openai_chat_model.strip() else None

    @property
    def agent_enabled(self) -> bool:
        return bool(self.openai_api_key.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
