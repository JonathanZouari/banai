"""explain_design: the agent describes the current design with a server-written text and never returns ops."""

import copy

from app.agent.explain import MAX_EXPLANATION, explain_design
from app.agent.orchestrator import run_agent
from app.agent.tools import EXPLAIN, TOOLS
from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe
from tests.agent.fakes import FakeOpenAI, call, raw_call, reply

CATALOG = load_catalog()
DESIGN = basic_wardrobe()
ASK = [{"role": "user", "content": "what do I have in my wardrobe?"}]
ASK_HE = [{"role": "user", "content": "מה יש לי בארון?"}]


def run(client, history=ASK, design=DESIGN):
    return run_agent(client, "test-model", copy.deepcopy(design), history, CATALOG)


# --- the description itself

def test_overview_describes_size_doors_finish_and_every_compartment():
    text = explain_design(DESIGN, None, "en")
    assert "200 cm wide, 240 cm tall and 60 cm deep" in text and "3 compartments" in text
    assert "3 hinged doors" in text and "white melamine matte" in text
    assert "Compartment 1 (64.3 cm wide): 4 shelves (at 40 cm, 80 cm, 120 cm, 160 cm)." in text
    assert "1 shelf (at 200 cm), 1 hanging rail (at 190 cm)" in text
    assert "2 shelves (at 80 cm, 140 cm), 2 drawers (at 0 cm, 20 cm)" in text
    assert text.endswith("not verified for manufacturing.")


def test_hebrew_overview_is_hebrew_with_the_same_facts():
    text = explain_design(DESIGN, "overview", "he")
    assert "ברוחב 200 ס\"מ" in text and "3 תאים" in text and "3 דלתות ציר" in text
    assert "תא 1 (רוחב 64.3 ס\"מ): 4 מדפים" in text and "2 מגירות" in text and "מוט תלייה" in text
    assert "לבן מלמין מט" in text
    assert text.endswith("לא נבדק לייצור.")


def test_focus_narrows_the_answer():
    assert explain_design(DESIGN, "doors", "en").startswith("3 hinged doors (hinges: left, right, left).")
    assert explain_design(DESIGN, "materials", "en").startswith("Carcass: white melamine matte. Doors: white melamine matte.")
    one = explain_design(DESIGN, "cmp_right", "en")
    assert one.startswith("Compartment 3") and "Compartment 1" not in one
    assert explain_design(DESIGN, "shf_l1", "en").startswith("Compartment 1")  # a component explains where it sits


def test_unknown_or_odd_focus_falls_back_to_the_overview():
    for focus in ("cmp_nope", "", "   ", "x" * 500, "../../etc"):
        text = explain_design(DESIGN, focus, "en")
        assert "Your wardrobe is" in text


def test_it_reports_exactly_what_the_design_holds_and_nothing_else():
    bare = copy.deepcopy(DESIGN)
    for compartment in bare["compartments"]:
        compartment.update(shelves=[], drawers=[], rails=[])
    bare["doors"].update(type="none", items=[])
    text = explain_design(bare, None, "en")
    assert text.count("empty") == 3 and "No doors." in text and "shelf" not in text and "drawer" not in text


def test_a_very_full_design_still_fits_in_the_signed_reply():
    full = copy.deepcopy(DESIGN)
    full["compartments"][0]["shelves"] = [{"id": f"shf_{n}", "y": 20 * n, "thickness": 18, "appearance": None} for n in range(1, 100)]
    text = explain_design(full, None, "en")
    assert len(text) <= MAX_EXPLANATION and text.endswith("not verified for manufacturing.")


# --- the agent tool

def test_the_tool_is_offered_and_read_only():
    tool = next(t for t in TOOLS if t["function"]["name"] == EXPLAIN)
    assert tool["function"]["parameters"]["additionalProperties"] is False
    assert "Read-only" in tool["function"]["description"]


def test_what_do_i_have_returns_a_description_and_no_ops():
    client = FakeOpenAI(reply(None, [call(EXPLAIN)]))
    before = copy.deepcopy(DESIGN)
    result = run(client)
    assert result.ops is None and result.design is None
    assert "Compartment 1" in result.reply and "3 hinged doors" in result.reply
    assert len(client.requests) == 1  # one model call: no repair loop, no follow-up
    assert DESIGN == before  # the design object is untouched


def test_hebrew_question_gets_the_hebrew_description():
    result = run(FakeOpenAI(reply(None, [call(EXPLAIN)])), history=ASK_HE)
    assert "תא 1" in result.reply and result.ops is None


def test_focus_is_passed_to_the_description():
    result = run(FakeOpenAI(reply(None, [call(EXPLAIN, focus="doors")])))
    assert result.reply.startswith("3 hinged doors") and "Compartment" not in result.reply


def test_malformed_or_hostile_arguments_never_break_it():
    for arguments in ("not json", "[1, 2]", '{"focus": 5}', '{"focus": "' + "a" * 400 + '"}', '{"extra": true}'):
        result = run(FakeOpenAI(reply(None, [raw_call(EXPLAIN, arguments)])))
        assert result.ops is None and "Your wardrobe is" in result.reply


def test_model_text_next_to_the_tool_call_is_not_shown():
    result = run(FakeOpenAI(reply("You have 99 shelves, all CNC-ready!", [call(EXPLAIN)])))
    assert "99" not in result.reply and "CNC" not in result.reply


def test_a_change_request_beats_an_explain_call():
    client = FakeOpenAI(reply("Added.", [call(EXPLAIN), call("add_shelf", "call_2", compartmentId="cmp_middle", y=500)]))
    result = run(client)
    assert [op["op"] for op in result.ops] == ["add_shelf"] and result.reply == "Added."


def test_off_topic_still_wins_over_explain():
    result = run(FakeOpenAI(reply(None, [call("decline_off_topic"), call(EXPLAIN, "call_2")])))
    assert result.ops is None and "wardrobe" in result.reply and "Compartment" not in result.reply


def test_the_prompt_tells_the_model_to_use_the_tool():
    client = FakeOpenAI(reply(None, [call(EXPLAIN)]))
    run(client)
    system = client.requests[0]["messages"][0]["content"]
    assert "explain_design" in system and "never propose changes for such a question" in system.lower().replace("\n", " ")
