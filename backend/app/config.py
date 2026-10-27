"""Application settings loaded from environment variables."""

import secrets
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# ASSUMPTION: a configurable default; override with OPENAI_CHAT_MODEL per environment.
DEFAULT_CHAT_MODEL = "gpt-5.4-mini"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "local"
    cors_origins: str = "http://localhost:5173"
    # AI agent. The key is server-only; it is never logged or returned.
    openai_api_key: str = ""
    openai_chat_model: str = ""
    proposal_signing_key: str = ""
    chat_timeout_s: float = 30.0
    chat_rate_limit: str = "20/minute"
    # Global ceiling on OpenAI-backed chat requests per hour (all clients), a spend guard.
    chat_hourly_cap: int = 300
    # Saved designs and the carpenter PDF: per-IP limits, and a global hourly ceiling on new designs.
    designs_rate_limit: str = "30/minute"
    designs_hourly_cap: int = 200
    # Bytes new designs may add per day (per worker; resets on restart): a typical design is a few kB,
    # the largest about 250 kB. Keep it well under the Supabase plan's database size.
    designs_daily_bytes: int = 25_000_000
    export_rate_limit: str = "10/minute"
    # Trusted proxies that append to X-Forwarded-For (Railway: set FORWARDED_HOPS after checking the
    # header on the deployment). 0 = use the connecting address (local development).
    forwarded_hops: int = 0
    # ASSUMPTION: configurable voice defaults (empty = the defaults in app/api/voice.py).
    openai_transcribe_model: str = ""
    openai_tts_model: str = ""
    openai_tts_voice: str = ""
    # Saved designs (Phase 7). Only the backend holds the secret key; the browser never talks to Supabase.
    supabase_url: str = ""
    supabase_secret_key: str = ""

    # Voice spend guards. Off by default; every value is a configurable default.
    voice_enabled: bool = False
    voice_rate_limit: str = "30/minute"
    voice_hourly_cap: int = 300
    voice_daily_budget_usd: float = 1.0
    voice_max_audio_bytes: int = 600_000  # about 20 s of browser-recorded audio
    voice_max_seconds: int = 20
    voice_tts_max_chars: int = 400

    @property
    def storage_enabled(self) -> bool:
        return bool(self.supabase_url.strip() and self.supabase_secret_key.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def chat_model(self) -> str:
        return self.openai_chat_model.strip() or DEFAULT_CHAT_MODEL

    @property
    def agent_enabled(self) -> bool:
        return bool(self.openai_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_signing_key() -> bytes:
    """The HMAC key for proposals. Required outside local development.

    Locally (APP_ENV=local) a missing key falls back to a random per-process key, so
    proposals simply expire on restart; every other environment must configure one.
    """
    settings = get_settings()
    key = settings.proposal_signing_key.strip()
    if key:
        return key.encode()
    if settings.app_env == "local":
        return secrets.token_bytes(32)
    raise RuntimeError("PROPOSAL_SIGNING_KEY is not configured")
