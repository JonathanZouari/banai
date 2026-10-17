"""The real FastAPI app with a scripted stand-in for OpenAI, for the Playwright suite.

Run with: uvicorn tests.e2e_app:app (see frontend/playwright.config.js). Everything except the LLM is the
production code path: validation, id filling, signing, the stale check. No network, no key needed."""

import json

from app.api.chat import get_agent_client
from app.config import Settings, get_settings
from app.main import app
from tests.agent.fakes import FakeOpenAI, call, reply

if get_settings().app_env != "e2e":  # it carries a public signing key: never load it anywhere else
    raise RuntimeError("tests.e2e_app is only for the Playwright suite (APP_ENV=e2e)")

SETTINGS = Settings(
    openai_api_key="e2e", openai_chat_model="e2e", proposal_signing_key="e" * 64,
    chat_rate_limit="1000/minute", voice_rate_limit="1000/minute",
)


class ScriptedAgent(FakeOpenAI):
    """Answers by keyword in the customer's latest message."""

    def __init__(self) -> None:
        super().__init__(transcript="please add a shelf in the middle")  # what the fake microphone "says"

    def _create(self, **kwargs):
        text = next(m["content"] for m in reversed(kwargs["messages"]) if m["role"] == "user").lower()
        system = kwargs["messages"][0]["content"]
        if "GUIDED MODE" in system and "compartments" not in text:  # the guided path asks before it builds
            return reply(None, [call("ask_clarification", question="How many compartments would you like?")])
        if "compartments" in text:  # the free-text description of the acceptance scenario (spec 21)
            return reply("Here is the wardrobe you described.", [
                call("create_wardrobe", "c1", width=2400, height=2600, depth=600, compartmentCount=3,
                     compartmentIds=["cmp_a", "cmp_b", "cmp_c"], partitionIds=["prt_a", "prt_b"]),
                *[call("add_shelf", f"s{n}", compartmentId="cmp_a", y=400 * n) for n in range(1, 5)],
                call("add_rail", "r1", compartmentId="cmp_b", y=1900),
                *[call("add_drawer", f"d{n}", compartmentId="cmp_c", y=200 * n - 200, height=200) for n in range(1, 4)],
            ])
        if "raise" in text:  # reads the shelf from the design in the prompt: proves the agent saw the latest state
            design = json.loads(system.split("CURRENT DESIGN (canonical JSON):\n", 1)[1].split("\n\nRESPONSE LANGUAGE", 1)[0])
            shelf = design["compartments"][0]["shelves"][0]
            return reply("Raising the first shelf by 10 cm.", [call("modify_shelf", id=shelf["id"], y=shelf["y"] + 100)])
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
