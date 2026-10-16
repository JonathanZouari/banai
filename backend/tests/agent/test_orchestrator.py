from app.agent.orchestrator import CLARIFY_FALLBACK, MAX_REPAIRS, run_agent
from app.agent.tools import TOOLS
from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe
from tests.agent.fakes import FakeOpenAI, call, raw_call, reply

CATALOG = load_catalog()
HISTORY = [{"role": "user", "content": "add a shelf"}]


def run(client):
    return run_agent(client, "test-model", basic_wardrobe(), HISTORY, CATALOG)


def bad_shelf():
    return reply(None, [call("add_shelf", compartmentId="cmp_missing", y=500)])


def good_shelf():
    return reply("Fixed.", [call("add_shelf", compartmentId="cmp_middle", y=500)])


def test_tool_calls_become_a_validated_batch():
    client = FakeOpenAI(
        reply("Done.", [call("add_shelf", compartmentId="cmp_middle", y=500), call("add_rail", "call_2", compartmentId="cmp_left", y=1950)])
    )
    result = run(client)
    assert [op["op"] for op in result.ops] == ["add_shelf", "add_rail"]
    assert result.reply == "Done."
    assert result.design is not None


def test_plain_answer_has_no_ops():
    result = run(FakeOpenAI(reply("A shelf is a horizontal board.")))
    assert result.ops is None and result.reply.startswith("A shelf")


def test_clarification_returns_the_question_and_no_ops():
    result = run(FakeOpenAI(reply(None, [call("ask_clarification", question="Which compartment?")])))
    assert result.ops is None and result.reply == "Which compartment?"


def test_an_invalid_batch_is_repaired_by_feeding_the_error_back():
    client = FakeOpenAI(bad_shelf(), good_shelf())
    result = run(client)
    assert result.ops and result.ops[0]["compartmentId"] == "cmp_middle"
    second = client.requests[1]["messages"]
    assert second[-1]["role"] == "tool" and "REJECTED" in second[-1]["content"]
    assert second[-2]["role"] == "assistant" and second[-2]["tool_calls"][0]["id"] == "call_1"


def test_gives_up_after_the_repair_budget_with_a_clarification():
    client = FakeOpenAI(*[bad_shelf() for _ in range(MAX_REPAIRS + 1)])
    result = run(client)
    assert result.ops is None and result.reply == CLARIFY_FALLBACK
    assert len(client.requests) == MAX_REPAIRS + 1


def test_malformed_tool_arguments_are_rejected_and_repaired():
    client = FakeOpenAI(reply(None, [raw_call("add_shelf", "{not json")]), good_shelf())
    assert run(client).ops


def test_unknown_tools_and_smuggled_op_field_are_rejected():
    smuggled = call("add_shelf", op="remove_component", compartmentId="cmp_left", y=1)
    for bad in (call("drop_database"), smuggled):
        client = FakeOpenAI(reply(None, [bad]), good_shelf())
        assert run(client).ops[0]["op"] == "add_shelf"


def test_request_carries_the_tools_the_design_and_the_history():
    client = FakeOpenAI(reply("ok"))
    run(client)
    request = client.requests[0]
    assert request["tools"] is TOOLS and request["model"] == "test-model"
    assert request["messages"][0]["role"] == "system" and "cmp_middle" in request["messages"][0]["content"]
    assert request["messages"][1:] == HISTORY


def test_every_op_has_a_tool_and_no_tool_exposes_the_op_discriminator():
    names = {t["function"]["name"] for t in TOOLS}
    assert "ask_clarification" in names and len(names) == 16
    for tool in TOOLS:
        assert "op" not in tool["function"]["parameters"]["properties"]
        assert "op" not in tool["function"]["parameters"].get("required", [])
