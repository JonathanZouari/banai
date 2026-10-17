"""Text to speech for the chat's spoken replies (ADR-028). OPENAI_TTS_MODEL wins; otherwise a current
speech model is picked from the models the customer's own key can use, because model names change.

The persona lives in INSTRUCTIONS: a seasoned master carpenter, mature, calm and warm, never pushy (the
About page persona; the user first asked for "not a tough salesman", then found a young, smiling voice
infantile). Only the gpt-4o-mini-tts family takes
instructions; the older tts-1 models get the text alone and a voice they support.

PREFERRED and the voice list are configurable defaults (not business rules), checked against OpenAI's
text-to-speech guide on 2026-10-17. The key and the text pass through memory only: nothing here stores
or logs either.
"""

import hashlib
import logging
import re
from collections import OrderedDict

import openai

from app.agent.chat import AgentError, describe_error, to_agent_error

PREFERRED = ("gpt-4o-mini-tts", "tts-1-hd", "tts-1")
_DATED = re.compile(r"-\d{4}-\d{2}-\d{2}$")
VOICES = ("alloy", "ash", "ballad", "cedar", "coral", "echo", "fable", "marin", "nova", "onyx", "sage", "shimmer", "verse")
TTS1_VOICES = ("alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer")
DEFAULT_VOICE = "cedar"  # OpenAI recommends marin or cedar for quality; the customer can pick another
MAX_SPOKEN_CHARS = 1200  # about a minute of speech; a longer reply is cut at the end of a sentence
MAX_AUDIO_BYTES = 8 * 1024 * 1024  # 1200 characters is a few MB of MP3; anything larger is refused

INSTRUCTIONS = (
    "Voice: a mature man, a seasoned master carpenter with thirty years at the workbench. Warm, calm and "
    "grounded, with quiet confidence. Sound like an experienced craftsman explaining a plan across the "
    "workbench to a customer he respects. "
    "Tone: steady, reassuring and precise. Friendly, never childish. Never pushy, never salesy, no hype, "
    "no announcer voice. "
    "Pace: unhurried, with short pauses between ideas. Say measurements clearly and deliberately. "
    "Language: speak the text in its own language. For Hebrew, use natural Israeli pronunciation."
)

_MARKUP = re.compile(r"[*_`#>|~]+")
_UNSAFE = re.compile("[\x00-\x08\x0b-\x1f\x7f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]")
_SENTENCE_END = re.compile(r"[.!?…\n](?=\s|$)")

logger = logging.getLogger("banai.speech")

_cache: OrderedDict[str, str] = OrderedDict()  # sha256(key) -> model id; the key itself is never kept
_CACHE_SIZE = 64


def spoken_text(text: str, limit: int = MAX_SPOKEN_CHARS) -> str:
    """The reply as it should be read aloud: no Markdown symbols or control characters, collapsed
    whitespace, and at most `limit` characters, cut after the last full sentence that fits."""
    clean = _UNSAFE.sub(" ", _MARKUP.sub(" ", text or ""))
    clean = re.sub(r"[ \t]+", " ", clean)
    clean = re.sub(r"\s*\n\s*", "\n", clean).strip()
    if len(clean) <= limit:
        return clean.replace("\n", " ")
    head = clean[:limit]
    ends = [m.end() for m in _SENTENCE_END.finditer(head)]
    if ends and ends[-1] > limit // 3:
        head = head[: ends[-1]]
    else:
        head = head[: head.rfind(" ")] if " " in head else head
    return head.strip().replace("\n", " ")


def _natural(model_id: str) -> list:
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", model_id)]


def pick_speech_model(model_ids) -> str | None:
    ids = set(model_ids)
    for name in PREFERRED:
        if name in ids:
            return name
    pool = [i for i in ids if "tts" in i and "realtime" not in i and not _DATED.search(i)]
    return max(pool, key=_natural) if pool else None


def speech_model_for(client, api_key: str, configured: str | None) -> str | None:
    if configured:
        return configured
    fingerprint = hashlib.sha256(api_key.encode()).hexdigest()
    if fingerprint in _cache:
        return _cache[fingerprint]
    model = pick_speech_model(m.id for m in client.models.list())
    if model:
        _cache[fingerprint] = model
        while len(_cache) > _CACHE_SIZE:
            _cache.popitem(last=False)
    return model


def takes_instructions(model: str) -> bool:
    return not model.startswith("tts-1")


def voice_for(model: str, voice: str) -> str:
    """The requested voice, or one the model supports (tts-1 has fewer voices)."""
    if takes_instructions(model):
        return voice
    return voice if voice in TTS1_VOICES else "ash"


def speak(api_key: str, text: str, voice: str, configured_model: str | None, client_factory=openai.OpenAI) -> bytes:
    """MP3 audio of `text` (already passed through spoken_text). Raises AgentError with our code,
    never OpenAI's message."""
    client = client_factory(api_key=api_key, timeout=30.0, max_retries=1)
    model = None
    try:
        model = speech_model_for(client, api_key, configured_model)
        if not model:
            raise AgentError(400, "MODEL_UNAVAILABLE", "Your OpenAI key has no speech model available.")
        extra = {"instructions": INSTRUCTIONS} if takes_instructions(model) else {}
        response = client.audio.speech.create(model=model, voice=voice_for(model, voice), input=text, response_format="mp3", **extra)
        audio = response.content if hasattr(response, "content") else response.read()
    except openai.OpenAIError as error:
        # No message, even for a 400: it could quote the reply text (security review, LOW-3).
        logger.warning("Speech failed: %s", describe_error(error, model, with_message=False))
        mapped = to_agent_error(error)
        if mapped.code == "MODEL_UNAVAILABLE":
            mapped = AgentError(mapped.status_code, mapped.code, "Your OpenAI key cannot use the speech model.")
        raise mapped from None
    finally:
        client.close()
    if not audio or len(audio) > MAX_AUDIO_BYTES:
        raise AgentError(502, "UPSTREAM", "The speech service returned no usable audio. Try again in a moment.")
    return audio
