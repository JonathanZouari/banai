"""A scripted stand-in for the OpenAI client (no network)."""

import json
from types import SimpleNamespace


def call(name: str, call_id: str = "call_1", **arguments):
    return SimpleNamespace(id=call_id, function=SimpleNamespace(name=name, arguments=json.dumps(arguments)))


def raw_call(name: str, arguments: str, call_id: str = "call_1"):
    return SimpleNamespace(id=call_id, function=SimpleNamespace(name=name, arguments=arguments))


def reply(content: str | None = None, calls: list | None = None):
    message = SimpleNamespace(content=content, tool_calls=calls or None)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


class FakeOpenAI:
    """Returns the scripted completions in order and records every request."""

    def __init__(self, *completions):
        self._completions = list(completions)
        self.requests: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.requests.append(kwargs)
        if not self._completions:
            raise AssertionError("the agent called OpenAI more often than scripted")
        return self._completions.pop(0)
