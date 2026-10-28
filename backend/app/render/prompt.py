"""The image prompt for the AI render. Written only by the server, from fixed text and facts of
the validated design (numbers and catalog names). Customer free text, such as custom names, never
reaches it: a custom appearance is described as "as shown in the image"."""

from __future__ import annotations

DOOR_TEXT = {
    "hinged": "{count} hinged doors",
    "sliding": "{count} sliding doors",
    "none": "no doors (open front, with the interior visible)",
}

INSTRUCTIONS = (
    "Turn this 3D render of a built-in wardrobe into a photorealistic product photo of the same wardrobe. "
    "Keep exactly: the proportions and overall size, the number and position of compartments, shelves, drawers "
    "and doors, the door type and handles, and the colours and finishes. Do not add, remove or move any part. "
    "Use realistic materials, soft studio lighting and a plain, clean light background with a floor. "
    "No room, no furniture, no people, no decorations, no text, no logos."
)


def _name(ref: dict, section: list[dict]) -> str | None:
    if ref.get("custom"):
        return None
    return next((entry["name"] for entry in section if entry["id"] == ref.get("catalogId")), None)


def _appearance(appearance: dict, catalog: dict) -> str:
    parts = [
        _name(appearance["color"], catalog["colors"]),
        _name(appearance["finish"], catalog["finishes"]),
        _name(appearance["material"], catalog["materials"]),
    ]
    known = [part.lower() for part in parts if part]
    if len(known) < len(parts):
        known.append("(custom details as shown in the image)")
    return " ".join(known)


def build_prompt(design: dict, catalog: dict) -> str:
    """The full prompt for a validated design (see app.domain.apply.apply_ops)."""
    dims = design["dimensions"]
    doors = design["doors"]
    door_text = DOOR_TEXT[doors["type"]].format(count=len(doors["items"]))
    facts = [
        f"Size: {dims['width'] / 10:g} cm wide, {dims['height'] / 10:g} cm high, {dims['depth'] / 10:g} cm deep.",
        f"{len(design['compartments'])} compartments, {door_text}.",
        f"Body: {_appearance(design['carcass']['appearance'], catalog)}.",
    ]
    if doors["type"] != "none":
        facts.append(f"Doors: {_appearance(doors['appearance'], catalog)}.")
    return f"{INSTRUCTIONS}\n\n" + "\n".join(facts)
