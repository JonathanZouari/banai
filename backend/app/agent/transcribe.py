"""Speech to text for the chat's push-to-talk. OPENAI_TRANSCRIBE_MODEL wins; otherwise a current
transcription model is picked from the models the customer's own key can use, because model names
change often.

PREFERRED is a configurable default (not a business rule). OpenAI's speech-to-text guide (checked
2026-10-17) recommends gpt-transcribe; the older gpt-4o models and whisper-1 remain for keys
without it. The diarizing model is never picked: it takes no prompt.

The audio and the key pass through memory only. Nothing here stores or logs either.
"""

import hashlib
import logging
import re
from collections import OrderedDict

import openai

from app.agent.chat import AgentError, describe_error, to_agent_error

PREFERRED = ("gpt-transcribe", "gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1")
_DATED = re.compile(r"-\d{4}-\d{2}-\d{2}$")
# Biases recognition toward wardrobe vocabulary. It is Hebrew because the prompt should match the
# audio's language and most customers speak Hebrew; no language is forced, so other languages still work.
PROMPT = "תכנון ארון בגדים: ארון, תא, מדף, מגירה, מוט תלייה, מחיצה, דלת, דלתות הזזה, ציר, ידית, מראה, רוחב, גובה, עומק, סנטימטר."

logger = logging.getLogger("banai.voice")

_cache: OrderedDict[str, str] = OrderedDict()  # sha256(key) -> model id; the key itself is never kept
_CACHE_SIZE = 64


def _natural(model_id: str) -> list:
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", model_id)]


def pick_transcribe_model(model_ids) -> str | None:
    ids = set(model_ids)
    for name in PREFERRED:
        if name in ids:
            return name
    pool = [i for i in ids if "transcribe" in i and "diarize" not in i and "realtime" not in i and not _DATED.search(i)]
    return max(pool, key=_natural) if pool else None


def transcribe_model_for(client, api_key: str, configured: str | None) -> str | None:
    if configured:
        return configured
    fingerprint = hashlib.sha256(api_key.encode()).hexdigest()
    if fingerprint in _cache:
        return _cache[fingerprint]
    model = pick_transcribe_model(m.id for m in client.models.list())
    if model:
        _cache[fingerprint] = model
        while len(_cache) > _CACHE_SIZE:
            _cache.popitem(last=False)
    return model


def transcribe(api_key: str, audio: bytes, filename: str, content_type: str, configured_model: str | None,
               client_factory=openai.OpenAI) -> str:
    """Returns the transcript (possibly empty). Raises AgentError with our code, never OpenAI's message."""
    client = client_factory(api_key=api_key, timeout=30.0, max_retries=1)
    model = None
    try:
        model = transcribe_model_for(client, api_key, configured_model)
        if not model:
            raise AgentError(400, "MODEL_UNAVAILABLE", "Your OpenAI key has no transcription model available.")
        result = client.audio.transcriptions.create(model=model, file=(filename, audio, content_type), prompt=PROMPT)
    except openai.OpenAIError as error:
        logger.warning("Transcription failed: %s", describe_error(error, model))
        mapped = to_agent_error(error)
        if mapped.code == "MODEL_UNAVAILABLE":
            mapped = AgentError(mapped.status_code, mapped.code, "Your OpenAI key cannot use the transcription model.")
        raise mapped from None
    finally:
        client.close()
    text = result if isinstance(result, str) else getattr(result, "text", "")
    return (text or "").strip()
