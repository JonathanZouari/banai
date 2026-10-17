"""Customer-facing API error texts in both chat languages. Domain errors keep their engine-owned text."""

from __future__ import annotations

from fastapi.responses import JSONResponse

from app.agent.language import Language
from app.api.envelope import fail

MESSAGES: dict[str, dict[Language, str]] = {
    "AGENT_UNAVAILABLE": {"he": "המעצב החכם עדיין לא מוגדר בשרת הזה.", "en": "The AI designer is not configured on this server."},
    "INVALID_MESSAGES": {"he": "ההודעה האחרונה חייבת להגיע מהלקוח.", "en": "The last message must come from the customer."},
    "AGENT_ERROR": {"he": "המעצב החכם לא זמין כרגע. נסה שוב בעוד רגע.", "en": "The AI designer is unavailable right now. Please try again."},
    "INVALID_SIGNATURE": {"he": "לא ניתן לאמת את ההצעה. בקש מהמעצב שוב.", "en": "This proposal was not issued by the server."},
    "STALE": {"he": "העיצוב השתנה אחרי שההצעה נוצרה. בקש מהמעצב הצעה חדשה.", "en": "The design changed since this proposal was made. Ask the designer to propose again."},
    "VOICE_UNAVAILABLE": {"he": "הקול לא זמין בשרת הזה.", "en": "Voice is not available on this server."},
    "VOICE_ERROR": {"he": "הקול לא זמין כרגע. אפשר להקליד את ההודעה.", "en": "Voice is unavailable right now. Please type your message."},
    "NO_SPEECH": {"he": "לא שמעתי דיבור. נסה שוב.", "en": "I could not hear any speech. Please try again."},
    "NO_AUDIO": {"he": "לא התקבלה הקלטה.", "en": "No audio was received."},
    "UNSUPPORTED_AUDIO": {"he": "פורמט השמע לא נתמך.", "en": "Unsupported audio format."},
    "PAYLOAD_TOO_LARGE": {"he": "ההקלטה ארוכה מדי.", "en": "The recording is too long."},
    "BAD_REPLY_SIGNATURE": {"he": "אפשר להקריא רק תשובות של המעצב.", "en": "Only the designer's own replies can be read aloud."},
}


def localized(status: int, code: str, language: Language = "en") -> JSONResponse:
    return fail(status, code, MESSAGES[code][language])
