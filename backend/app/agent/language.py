"""Reply language: the agent answers only in the language the customer's latest message is
written in (Hebrew, English or French). The language chosen in the chat is used when a message
has no letters to go by (e.g. "240?"). The chat UI switches its language to match what was written.

English and French share the Latin script, so they are told apart by French letters (é, à, ç...)
and by common words. Latin text with no clue either way (e.g. "240 cm", "OK") keeps the chosen
Latin language. Mirrored in frontend/src/chat/i18n.js (detectLanguage); both run the shared cases
in shared/fixtures/language/detect.json."""

from __future__ import annotations

import re
from typing import Literal

Language = Literal["he", "en", "fr"]
LANGUAGES: tuple[Language, ...] = ("he", "en", "fr")

_HEBREW = re.compile(r"[א-ת]")
_FRENCH_LETTERS = "àâæçéèêëîïôœùûüÿ"
_LATIN = re.compile(f"[a-z{_FRENCH_LETTERS}]", re.IGNORECASE)
_FRENCH_LETTER = re.compile(f"[{_FRENCH_LETTERS}]", re.IGNORECASE)
_WORD = re.compile(f"[a-z{_FRENCH_LETTERS}]+")
FRENCH_LETTER_WEIGHT = 2  # an accented French letter counts as two French words

# Words that are common in one language and not used in the other (in this context). Words both
# languages use ("on", "a", "plus", "six", "large", "centre"...) are left out on purpose.
FRENCH_WORDS = frozenset("""
je j tu il elle nous vous le la les l un une des du de d au aux et ou avec pour dans sur sous
entre sans mais donc est sont suis peux peut pouvez veux voudrais aimerais faire fais faites mettre
mets ajoute ajouter ajoutez enleve enlever supprime supprimer changer mon ma mes ton ta votre vos
ce cette ces qui que qu quoi comment pourquoi quel quelle bonjour salut merci oui non bien
armoire placard porte portes tiroir tiroirs etagere etageres étagère étagères penderie tringle
caisson cloison cloisons compartiment compartiments largeur hauteur profondeur haut haute profond
profonde blanc blanche noir noire gris grise bois chene chêne noyer laque laqué brillant
coulissante coulissantes battante battantes gauche droite milieu deux trois quatre cinq
""".split())
ENGLISH_WORDS = frozenset("""
i you we it the an and or with for in of to from at by is are be can could would should please
want need like make add remove change put give set my your this that these what how why which
hello hi hey thanks thank yes no okay wardrobe closet cabinet door doors drawer drawers shelf
shelves rail hanging compartment compartments partition partitions width wide height high tall
depth deep white black grey gray wood oak walnut glossy gloss matte sliding hinged left right
middle two three four five more less bigger smaller
""".split())

# Fixed texts (never model-written).
OFF_TOPIC_REPLY: dict[Language, str] = {
    "he": "אני כאן כדי לעזור רק בעיצוב ותכנון הארון שלך: מידות, חלוקה פנימית, מדפים ומגירות, "
          "דלתות, חומרים, צבעים וגימורים. במה אפשר לעזור בעיצוב?",
    "en": "I'm here to help only with designing and planning your wardrobe: dimensions, interior "
          "layout, shelves and drawers, doors, materials, colours and finishes. How can I help with your design?",
    "fr": "Je suis là uniquement pour vous aider à concevoir et planifier votre armoire : dimensions, "
          "aménagement intérieur, étagères et tiroirs, portes, matériaux, couleurs et finitions. "
          "Comment puis-je vous aider pour votre projet ?",
}
FALLBACK_REPLY: dict[Language, str] = {
    "he": "לא הצלחתי להפוך את הבקשה לשינוי תקין בארון. אפשר לנסח אותה אחרת, או לספר לי קצת יותר מה תרצה?",
    "en": "I couldn't turn that into a valid change to your wardrobe. Could you rephrase it, or tell me a bit more?",
    "fr": "Je n'ai pas réussi à transformer cette demande en une modification valide de votre armoire. "
          "Pouvez-vous la reformuler, ou m'en dire un peu plus ?",
}

# The instruction appended at the very end of the system prompt (after the per-turn data).
# It overrides the language of earlier messages in the conversation.
INSTRUCTION: dict[Language, str] = {
    "he": "Write EVERYTHING customer-facing in HEBREW (reply, summary, change titles and details, "
          "questions, answers), even if earlier messages were in another language. Write centimetres as ס\"מ. "
          "Translate catalog names (Walnut -> אגוז, White -> לבן).",
    "en": "Write EVERYTHING customer-facing in ENGLISH (reply, summary, change titles and details, "
          "questions, answers), even if earlier messages were in another language. Write centimetres as cm.",
    "fr": "Write EVERYTHING customer-facing in FRENCH (reply, summary, change titles and details, "
          "questions, answers), even if earlier messages were in another language. Write centimetres as cm. "
          "Translate catalog names (Walnut -> Noyer, White -> Blanc). Address the customer as \"vous\".",
}


def detect(text: str, current: str | None = None) -> Language | None:
    """The language a message is written in, or None when it has no Hebrew or Latin letters.
    Hebrew wins when a message mixes scripts (e.g. Hebrew with an English brand name). Latin text
    with no clue either way keeps `current` when that is English or French, else English."""
    if _HEBREW.search(text):
        return "he"
    if not _LATIN.search(text):
        return None
    words = _WORD.findall(text.lower())
    french = sum(word in FRENCH_WORDS for word in words)
    if _FRENCH_LETTER.search(text):
        french += FRENCH_LETTER_WEIGHT
    english = sum(word in ENGLISH_WORDS for word in words)
    if french != english:
        return "fr" if french > english else "en"
    return current if current in ("en", "fr") else "en"


def reply_language(messages: list[dict], chosen: Language) -> Language:
    latest = next((m["text"] for m in reversed(messages) if m["role"] == "user"), "")
    return detect(latest, chosen) or chosen
