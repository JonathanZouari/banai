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

    def __init__(self, *completions, transcript: str = "hello", speech: bytes = b"ID3-fake-mp3"):
        self._completions = list(completions)
        self.requests: list[dict] = []
        self.audio_requests: list[dict] = []  # transcription and speech calls, in order
        self._transcript, self._speech = transcript, speech
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))
        self.audio = SimpleNamespace(
            transcriptions=SimpleNamespace(create=self._transcribe), speech=SimpleNamespace(create=self._speak)
        )

    def _transcribe(self, **kwargs):
        self.audio_requests.append({"kind": "transcribe", **kwargs})
        return SimpleNamespace(text=self._transcript)

    def _speak(self, **kwargs):
        self.audio_requests.append({"kind": "speak", **kwargs})
        return SimpleNamespace(content=self._speech)

    def _create(self, **kwargs):
        self.requests.append(kwargs)
        if not self._completions:
            raise AssertionError("the agent called OpenAI more often than scripted")
        return self._completions.pop(0)
