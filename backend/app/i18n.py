"""Languages for the carpenter's dossier (and later the conversation): Hebrew, English, Russian, Arabic.

Hebrew is the source language: every translatable string is written in Hebrew in the code and passed
through `tr()`, with named placeholders instead of f-strings, e.g. `tr("תא {n} · גבהים מהרצפה", n=2)`.
The translations live in app/i18n_catalog.py, keyed by that Hebrew source. The language is a context
variable set for one dossier (`with language("ru"): ...`), so deep code (part names, advisories,
drawings) translates without passing the language around. Outside that block everything stays Hebrew,
as the workspace expects.

A missing translation falls back to the Hebrew source and is recorded in MISSING; the tests fail on
any entry there, and on any Hebrew letter left in a non-Hebrew dossier.
"""

from __future__ import annotations

import re
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date

LANGUAGES = ("he", "en", "ru", "ar")
RTL = frozenset({"he", "ar"})
NAMES = {"he": "עברית", "en": "English", "ru": "Русский", "ar": "العربية"}

_current: ContextVar[str] = ContextVar("banai_language", default="he")
MISSING: set[str] = set()

_MONTHS = {
    "he": ("ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"),
    "en": ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
           "November", "December"),
    "ru": ("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября",
           "ноября", "декабря"),
    "ar": ("يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"),
}


@contextmanager
def language(lang: str):
    """Translate everything inside the block into `lang` (one of LANGUAGES)."""
    if lang not in LANGUAGES:
        raise ValueError(f"unsupported language: {lang!r}")
    token = _current.set(lang)
    try:
        yield lang
    finally:
        _current.reset(token)


def current() -> str:
    return _current.get()


def is_rtl(lang: str | None = None) -> bool:
    return (lang or current()) in RTL


_HEBREW = re.compile("[\u0590-\u05ff]")


def template(source: str) -> str:
    """The text of `source` in the current language, placeholders not yet filled. A string without Hebrew
    letters (a number, a code like HDF, or text already translated) is returned as it is."""
    lang = _current.get()
    if lang == "he" or not _HEBREW.search(source):
        return source
    from app.i18n_catalog import CATALOG  # imported late: the catalog is large and only needed here

    entry = CATALOG.get(source)
    if entry and entry.get(lang):
        return entry[lang]
    MISSING.add(source)
    return source


def tr(source: str, **params) -> str:
    """`source` (Hebrew) in the current language, with `params` filled in."""
    text = template(source)
    return text.format(**params) if params else text


def long_date(day: date, lang: str | None = None) -> str:
    lang = lang or current()
    month = _MONTHS[lang][day.month - 1]
    if lang == "he":
        return f"{day.day} ב{month} {day.year}"
    if lang == "en":
        return f"{month} {day.day}, {day.year}"
    return f"{day.day} {month} {day.year}"
