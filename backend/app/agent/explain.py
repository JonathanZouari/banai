"""Plain-language explanation of the CURRENT design, written by the server from the validated design (never
from model text), in Hebrew or English. Read-only: it produces text and never ops, so the agent's
`explain_design` tool can answer "what do I have?" without proposing anything."""

from __future__ import annotations

from app.agent.describe import cm, cm_he
from app.agent.language import Language
from app.domain.lookup import locate

MAX_EXPLANATION = 900  # the reply is signed and may be read aloud (the speech cap is 1000 characters)
FOCUS_VALUES = ("overview", "doors", "materials")

_HE_NAMES = {
    "melamine": "מלמין", "oak_veneer": "ציפוי אלון", "lacquered_mdf": "MDF צבוע",
    "white": "לבן", "light_grey": "אפור בהיר", "anthracite": "אנתרציט", "black": "שחור", "natural_oak": "אלון טבעי", "walnut": "אגוז",
    "matte": "מט", "satin": "סטן", "gloss": "מבריק",
}
_DISCLAIMER = {
    "he": "העיצוב להמחשה בלבד ולא נבדק לייצור.",
    "en": "This design is illustrative only and not verified for manufacturing.",
}


def _ref(ref: dict | None) -> str | None:
    if not ref:
        return None
    return ref["name"] if ref.get("custom") else str(ref.get("catalogId", ""))


def _name(value: str | None, language: Language) -> str:
    if not value:
        return ""
    return _HE_NAMES.get(value, value.replace("_", " ")) if language == "he" else value.replace("_", " ")


def _look(appearance: dict, language: Language) -> str:
    parts = [_name(_ref(appearance.get(field)), language) for field in ("color", "material", "finish")]
    return " ".join(part for part in parts if part)


def _length(mm: int, language: Language) -> str:
    return cm_he(mm) if language == "he" else cm(mm)


def _plural(count: int, one: str, many: str) -> str:
    return f"{count} {one if count == 1 else many}"


def _items(compartment: dict, language: Language, detailed: bool) -> str:
    """What one compartment holds, lowest first. `detailed=False` gives counts only (for long designs)."""
    he = language == "he"
    spec = (
        ("shelves", "מדף", "מדפים", "shelf", "shelves"),
        ("drawers", "מגירה", "מגירות", "drawer", "drawers"),
        ("rails", "מוט תלייה", "מוטות תלייה", "hanging rail", "hanging rails"),
    )
    out = []
    for key, he_one, he_many, en_one, en_many in spec:
        items = sorted(compartment[key], key=lambda item: item["y"])
        if not items:
            continue
        label = _plural(len(items), he_one, he_many) if he else _plural(len(items), en_one, en_many)
        if detailed:
            at = ", ".join(_length(item["y"], language) for item in items)
            label += f" (ב-{at})" if he else f" (at {at})"
        out.append(label)
    return ", ".join(out) if out else ("ריק" if he else "empty")


def _compartment_line(design: dict, index: int, language: Language, detailed: bool) -> str:
    compartment = design["compartments"][index]
    width = _length(compartment["width"], language)
    if language == "he":
        return f"תא {index + 1} (רוחב {width}): {_items(compartment, language, detailed)}."
    return f"Compartment {index + 1} ({width} wide): {_items(compartment, language, detailed)}."


def _doors(design: dict, language: Language) -> str:
    doors = design["doors"]
    count = len(doors["items"])
    he = language == "he"
    if doors["type"] == "hinged" and count:
        sides = {"left": "שמאל" if he else "left", "right": "ימין" if he else "right"}
        hinges = ", ".join(sides[item["hingeSide"]] for item in doors["items"])
        if he:
            return f"{_plural(count, 'דלת ציר', 'דלתות ציר')} (צירים: {hinges})."
        return f"{_plural(count, 'hinged door', 'hinged doors')} (hinges: {hinges})."
    if doors["type"] == "sliding" and count:
        return f"{count} דלתות הזזה." if he else f"{count} sliding doors."
    return "אין דלתות." if he else "No doors."


def _materials(design: dict, language: Language) -> str:
    carcass = _look(design["carcass"]["appearance"], language)
    doors = _look(design["doors"]["appearance"], language) if design["doors"]["items"] else ""
    if language == "he":
        return f"גוף הארון: {carcass}." + (f" דלתות: {doors}." if doors else "")
    return f"Carcass: {carcass}." + (f" Doors: {doors}." if doors else "")


def _size(design: dict, language: Language) -> str:
    d = design["dimensions"]
    count = len(design["compartments"])
    if language == "he":
        return (f"הארון ברוחב {cm_he(d['width'])}, גובה {cm_he(d['height'])} ועומק {cm_he(d['depth'])}, "
                f"עם {_plural(count, 'תא', 'תאים')}.")
    return (f"Your wardrobe is {cm(d['width'])} wide, {cm(d['height'])} tall and {cm(d['depth'])} deep, "
            f"with {_plural(count, 'compartment', 'compartments')}.")


def _focus_compartment(design: dict, focus: str) -> int | None:
    """Index of the compartment a component id refers to (a compartment, or anything inside one), else None."""
    found = locate(design, focus) if focus not in FOCUS_VALUES else None
    if not found:
        return None
    kind, index, _ = found
    return index if kind in ("compartment", "shelves", "drawers", "rails") else None


def explain_design(design: dict, focus: str | None = None, language: Language = "en") -> str:
    """Describe `design`. `focus` is "overview" (default), "doors", "materials" or a component id; anything
    else falls back to the overview. Always ends with the not-for-manufacturing note."""
    focus = (focus or "overview").strip()[:60]
    note = _DISCLAIMER[language]
    if focus == "doors":
        return f"{_doors(design, language)} {note}"
    if focus == "materials":
        return f"{_materials(design, language)} {note}"
    index = _focus_compartment(design, focus)
    if index is not None:
        return f"{_compartment_line(design, index, language, detailed=True)} {note}"
    for detailed in (True, False):  # a very full design falls back to counts so it still fits
        lines = [_size(design, language), _materials(design, language), _doors(design, language)]
        lines += [_compartment_line(design, i, language, detailed) for i in range(len(design["compartments"]))]
        text = "\n".join([*lines, note])
        if len(text) <= MAX_EXPLANATION:
            return text
    return text[: MAX_EXPLANATION - len(note) - 2].rstrip() + f"…\n{note}"
