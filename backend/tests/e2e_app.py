"""The real FastAPI app with a scripted stand-in for OpenAI, for the Playwright suite.

Run with: uvicorn tests.e2e_app:app (see frontend/playwright.config.js). Everything except the LLM is the
production code path: validation, id filling, signing, the stale check. No network, no key needed."""

from app.api.chat import get_agent_client
from app.config import Settings, get_settings
from app.main import app
from tests.agent.fakes import FakeOpenAI, call, reply

SETTINGS = Settings(
    openai_api_key="e2e", openai_chat_model="e2e", proposal_signing_key="e" * 64, chat_rate_limit="1000/minute"
)


class ScriptedAgent(FakeOpenAI):
    """Answers by keyword in the customer's latest message."""

    def __init__(self) -> None:
        super().__init__()

    def _create(self, **kwargs):
        text = next(m["content"] for m in reversed(kwargs["messages"]) if m["role"] == "user").lower()
        if "shelf" in text:
            return reply("I added a shelf to the middle compartment.", [call("add_shelf", compartmentId="cmp_middle", y=500)])
        if "sliding" in text:
            return reply("Switching to two sliding doors.", [call("configure_doors", type="sliding", count=2)])
        if "wider" in text:
            return reply("Widening to 240 cm.", [call("update_dimensions", width=2400)])
        if "nicer" in text:
            return reply(None, [call("ask_clarification", question="What would make it nicer: colour, doors or layout?")])
        if "broken" in text:
            return reply(None, [call("add_shelf", compartmentId="cmp_missing", y=500)])
        return reply("I can help with shelves, doors and sizes.")


app.dependency_overrides[get_settings] = lambda: SETTINGS
app.dependency_overrides[get_agent_client] = lambda: ScriptedAgent()
