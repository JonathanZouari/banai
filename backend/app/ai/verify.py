"""Checks an OpenAI API key with a free metadata call. The key is never stored or logged."""

import re
from dataclasses import dataclass
from typing import Literal

import openai

from app.agent.models import chat_model_for

KEY_PATTERN = re.compile(r"^sk-[A-Za-z0-9_-]{16,500}$")

Status = Literal["connected", "invalid_key", "model_unavailable", "unreachable"]


@dataclass(frozen=True)
class Verification:
    status: Status
    model: str | None


def mask_key(api_key: str) -> str:
    return f"sk-...{api_key[-4:]}"


def verify_openai_key(api_key: str, model: str | None, client_factory=openai.OpenAI) -> Verification:
    """Retrieves the configured model, or picks one from the key's model list, to prove the key works.

    OpenAI's own error messages are never passed on: they can echo part of the key.
    """
    client = client_factory(api_key=api_key, timeout=10.0, max_retries=0)
    try:
        if model:
            client.models.retrieve(model)
        else:
            model = chat_model_for(client, api_key, None)
            if not model:
                return Verification("model_unavailable", None)
    except (openai.AuthenticationError, openai.PermissionDeniedError):
        return Verification("invalid_key", model)
    except openai.NotFoundError:
        return Verification("model_unavailable", model)
    except openai.OpenAIError:
        return Verification("unreachable", model)
    finally:
        client.close()
    return Verification("connected", model)
