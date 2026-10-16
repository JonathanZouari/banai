"""Chooses the chat model. OPENAI_CHAT_MODEL wins; otherwise a small, current chat model is picked
from the models the customer's own key can use, because model names change often.

PREFERRED is a configurable default (not a business rule): newest small models first.
"""

import hashlib
import re
from collections import OrderedDict

PREFERRED = ("gpt-5.6-luna", "gpt-5.4-mini", "gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini")
_NOT_CHAT = ("audio", "realtime", "transcribe", "tts", "search", "image", "embedding", "moderation", "instruct", "codex")
_DATED = re.compile(r"-\d{4}-\d{2}-\d{2}$")

_cache: OrderedDict[str, str] = OrderedDict()  # sha256(key) -> model id; the key itself is never kept
_CACHE_SIZE = 64


def _natural(model_id: str) -> list:
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", model_id)]


def pick_chat_model(model_ids) -> str | None:
    ids = set(model_ids)
    for name in PREFERRED:
        if name in ids:
            return name
    chat = [i for i in ids if i.startswith("gpt-") and not _DATED.search(i) and not any(x in i for x in _NOT_CHAT)]
    minis = [i for i in chat if "mini" in i]
    pool = minis or chat
    return max(pool, key=_natural) if pool else None


def chat_model_for(client, api_key: str, configured: str | None) -> str | None:
    if configured:
        return configured
    fingerprint = hashlib.sha256(api_key.encode()).hexdigest()
    if fingerprint in _cache:
        return _cache[fingerprint]
    model = pick_chat_model(m.id for m in client.models.list())
    if model:
        _cache[fingerprint] = model
        while len(_cache) > _CACHE_SIZE:
            _cache.popitem(last=False)
    return model
