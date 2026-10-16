"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "local"
    cors_origins: str = "http://localhost:5173"

    # AI agent. The key is server-only; it is never logged or returned.
    openai_api_key: SecretStr | None = None
    # ASSUMPTION: a configurable default, not a business rule.
    openai_chat_model: str = "gpt-4.1-mini"
    proposal_signing_key: SecretStr | None = None
    chat_timeout_s: float = 30.0
    chat_rate_limit: str = "20/minute"
    # Global ceiling on OpenAI-backed requests per hour (all clients), a spend guard.
    chat_hourly_cap: int = 300

    # Voice (speech in, spoken reply). Off by default; every value is a configurable default.
    voice_enabled: bool = False
    openai_stt_model: str = "gpt-4o-mini-transcribe"
    openai_tts_model: str = "gpt-4o-mini-tts"
    openai_tts_voice: str = "alloy"
    voice_rate_limit: str = "30/minute"
    voice_hourly_cap: int = 300
    voice_daily_budget_usd: float = 1.0
    voice_max_audio_bytes: int = 600_000  # about 20 s of browser-recorded audio
    voice_max_seconds: int = 20
    voice_tts_max_chars: int = 400

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def agent_configured(self) -> bool:
        key = self.openai_api_key.get_secret_value().strip() if self.openai_api_key else ""
        sign = self.proposal_signing_key.get_secret_value().strip() if self.proposal_signing_key else ""
        return bool(key) and len(sign) >= 32


@lru_cache
def get_settings() -> Settings:
    return Settings()
