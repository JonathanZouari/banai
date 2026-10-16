"""One chat turn: the system prompt, the conversation so far, and the Jerusalem weather tool.

Text replies only. Design proposals (signed ops) arrive in Phase 5.
"""

import json
from dataclasses import dataclass

import openai

from app.agent.models import chat_model_for
from app.agent.prompts import SYSTEM_PROMPT
from app.agent.weather import get_jerusalem_weather

WEATHER_TOOL_NAME = "get_jerusalem_weather"
WEATHER_TOOL = {
    "type": "function",
    "function": {
        "name": WEATHER_TOOL_NAME,
        "description": "Current weather in Jerusalem, Israel. The only weather the assistant may report.",
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
    },
}
MAX_TOOL_ROUNDS = 2


@dataclass(frozen=True)
class ChatResult:
    reply: str
    model: str


class AgentError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def run_chat(client, model: str, messages: list[dict], weather=get_jerusalem_weather) -> str:
    """Calls the model, runs at most MAX_TOOL_ROUNDS of weather lookups, and returns the reply text."""
    conversation = [{"role": "system", "content": SYSTEM_PROMPT}, *messages]
    weather_result = None
    for round_number in range(MAX_TOOL_ROUNDS + 1):
        last_round = round_number == MAX_TOOL_ROUNDS
        response = client.chat.completions.create(
            model=model, messages=conversation, tools=[WEATHER_TOOL], tool_choice="none" if last_round else "auto",
        )
        message = response.choices[0].message
        if not message.tool_calls:
            return (message.content or "").strip()
        conversation.append({
            "role": "assistant",
            "content": message.content,
            "tool_calls": [
                {"id": call.id, "type": "function", "function": {"name": call.function.name, "arguments": call.function.arguments}}
                for call in message.tool_calls
            ],
        })
        for call in message.tool_calls:
            if call.function.name == WEATHER_TOOL_NAME:
                weather_result = weather_result or weather()
                result = weather_result
            else:
                result = {"error": "Unknown tool."}
            conversation.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, ensure_ascii=False)})
    return ""


def to_agent_error(error: openai.OpenAIError) -> AgentError:
    """Maps SDK errors to our codes. OpenAI's own messages are dropped: they can echo part of the key."""
    if isinstance(error, (openai.AuthenticationError, openai.PermissionDeniedError)):
        return AgentError(401, "INVALID_KEY", "OpenAI rejected the API key. Check it in AI settings.")
    if isinstance(error, openai.NotFoundError):
        return AgentError(400, "MODEL_UNAVAILABLE", "Your OpenAI key cannot use the chat model.")
    if isinstance(error, openai.RateLimitError):
        return AgentError(429, "OPENAI_RATE_LIMIT", "OpenAI is rate-limiting this key or its quota is used up. Try again later.")
    return AgentError(502, "UPSTREAM", "The AI service is unavailable right now. Try again in a moment.")


def answer(api_key: str, messages: list[dict], configured_model: str | None, client_factory=openai.OpenAI) -> ChatResult:
    client = client_factory(api_key=api_key, timeout=45.0, max_retries=1)
    try:
        model = chat_model_for(client, api_key, configured_model)
        if not model:
            raise AgentError(400, "MODEL_UNAVAILABLE", "Your OpenAI key has no chat model available.")
        reply = run_chat(client, model, messages)
    except openai.OpenAIError as error:
        raise to_agent_error(error) from None
    finally:
        client.close()
    if not reply:
        raise AgentError(502, "EMPTY_REPLY", "The AI returned an empty answer. Please try again.")
    return ChatResult(reply, model)
