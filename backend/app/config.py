"""Application settings loaded from environment variables."""

import secrets
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# ASSUMPTION: a configurable default; override with OPENAI_CHAT_MODEL per environment.
DEFAULT_CHAT_MODEL = "gpt-5.4-mini"
# ASSUMPTION: configurable ElevenLabs defaults. eleven_v3 and scribe_v2 support Hebrew;
# the voice is the one used in ElevenLabs' own examples (replace with ELEVENLABS_VOICE_ID).
DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"
DEFAULT_TTS_MODEL = "eleven_v3"
DEFAULT_STT_MODEL = "scribe_v2"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "local"
    cors_origins: str = "http://localhost:5173"
    openai_api_key: str = ""
    openai_chat_model: str = ""
    proposal_signing_key: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""
    elevenlabs_tts_model: str = ""
    elevenlabs_stt_model: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def chat_model(self) -> str:
        return self.openai_chat_model.strip() or DEFAULT_CHAT_MODEL

    @property
    def agent_enabled(self) -> bool:
        return bool(self.openai_api_key.strip())

    @property
    def voice_enabled(self) -> bool:
        return bool(self.elevenlabs_api_key.strip())

    @property
    def voice_id(self) -> str:
        return self.elevenlabs_voice_id.strip() or DEFAULT_VOICE_ID

    @property
    def tts_model(self) -> str:
        return self.elevenlabs_tts_model.strip() or DEFAULT_TTS_MODEL

    @property
    def stt_model(self) -> str:
        return self.elevenlabs_stt_model.strip() or DEFAULT_STT_MODEL


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
