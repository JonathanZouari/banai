"""OpenAI function tools: one per op (the op protocol is the only way the agent changes anything)
plus `ask_clarification`. Schemas come from the same pydantic models that validate the ops, so the
model is told exactly what the engine will accept. Tool names equal the `op` literal."""

from __future__ import annotations

import copy

from app.domain import ops as o

CLARIFY = "ask_clarification"
MAX_QUESTION = 300

# (op name, model, what it does). All lengths are integer millimetres.
_OPS: list[tuple[str, type, str]] = [
    ("create_wardrobe", o.CreateWardrobe, "Start a brand-new wardrobe from scratch, replacing the current one. Splits the interior width equally into compartmentCount compartments."),
    ("update_dimensions", o.UpdateDimensions, "Change the overall width, height and/or depth (mm). Compartments scale to fit."),
    ("configure_doors", o.ConfigureDoors, "Set the door type: hinged (give doors with compartmentIds and hingeSide, or omit for one door per compartment), sliding (give count 1-6) or none."),
    ("add_compartment", o.AddCompartment, "Insert a new compartment at position (0 = far left) taking its width from a neighbour."),
    ("modify_compartment", o.ModifyCompartment, "Change one compartment's width (mm); neighbours absorb the difference."),
    ("add_partition", o.AddPartition, "Split a compartment into two with a vertical partition, offset mm from the compartment's left edge."),
    ("modify_partition", o.ModifyPartition, "Move or re-thicken an existing partition."),
    ("add_shelf", o.AddShelf, "Add a shelf in a compartment; y is mm from the top face of the bottom panel to the shelf's underside."),
    ("modify_shelf", o.ModifyShelf, "Move or re-thicken an existing shelf."),
    ("add_drawer", o.AddDrawer, "Add a drawer in a compartment; y is mm from the top face of the bottom panel to its underside."),
    ("modify_drawer", o.ModifyDrawer, "Move or resize an existing drawer."),
    ("add_rail", o.AddRail, "Add a hanging rail in a compartment at height y (mm from the top face of the bottom panel)."),
    ("modify_rail", o.ModifyRail, "Move an existing hanging rail to a new height y."),
    ("set_material", o.SetMaterial, "Set material/colour/finish. target is 'carcass', 'doors' or a component id; clear=true resets an item override."),
    ("remove_component", o.RemoveComponent, "Remove a shelf, drawer, rail, partition or compartment by id."),
]


def _clean(node: object, in_properties: bool = False) -> object:
    """Drop pydantic's noisy `title` keys and the `op` discriminator (carried by the tool name)."""
    if isinstance(node, dict):
        out = {}
        for key, value in node.items():
            if key == "title" and not in_properties:
                continue
            out[key] = _clean(value, in_properties=(key == "properties"))
        return out
    if isinstance(node, list):
        return [_clean(item) for item in node]
    return node


def _parameters(model: type) -> dict:
    schema = copy.deepcopy(model.model_json_schema(by_alias=True))
    schema["properties"].pop("op", None)
    schema["required"] = [name for name in schema.get("required", []) if name != "op"]
    return _clean(schema)


def build_tools() -> list[dict]:
    tools = [
        {"type": "function", "function": {"name": name, "description": description, "parameters": _parameters(model)}}
        for name, model, description in _OPS
    ]
    tools.append({
        "type": "function",
        "function": {
            "name": CLARIFY,
            "description": "Ask the customer ONE short question when the request is too ambiguous to propose a safe change. Use sparingly.",
            "parameters": {
                "type": "object",
                "properties": {"question": {"type": "string", "maxLength": MAX_QUESTION}},
                "required": ["question"],
                "additionalProperties": False,
            },
        },
    })
    return tools


OP_NAMES = frozenset(name for name, _, _ in _OPS)
TOOLS = build_tools()
