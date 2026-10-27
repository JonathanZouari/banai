"""A scripted stand-in for the OpenAI client (chat.completions.create only)."""

from __future__ import annotations

import json
from types import SimpleNamespace


def tool_call(name: str, arguments: dict | str, call_id: str = "call_1") -> SimpleNamespace:
    args = arguments if isinstance(arguments, str) else json.dumps(arguments)
    return SimpleNamespace(id=call_id, type="function", function=SimpleNamespace(name=name, arguments=args))


def completion(content: str | None = None, calls: list | None = None) -> SimpleNamespace:
    message = SimpleNamespace(content=content, tool_calls=calls or None)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


class FakeClient:
    """Returns the scripted completions in order and records every request."""

    def __init__(self, *responses, error: Exception | None = None):
        self.responses = list(responses)
        self.error = error
        self.requests: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.requests.append(json.loads(json.dumps(kwargs, default=str)))  # snapshot (messages list is mutated later)
        if self.error:
            raise self.error
        return self.responses.pop(0)


def propose(ops: list[dict], **overrides) -> dict:
    return {
        "reply": "Here is my proposal.",
        "summary": "Adds a shelf.",
        "changes": [{"title": "Shelf", "detail": "New shelf at 100 cm in the left compartment"}],
        "ops": ops,
        **overrides,
    }
