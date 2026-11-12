"""AI photoreal render: the client sends its committed design and the app's own 3D snapshot of it,
the server validates both, writes the prompt itself and asks the image model for an illustrative
photo. The design is never changed and nothing is stored. Every call costs money, so it is
capped per worker (concurrency), per client and overall (sliding windows)."""

from __future__ import annotations

import base64
import json
import logging
import time
from collections import deque
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.api.agent import error, get_llm_client
from app.api.export import read_capped
from app.config import Settings, get_settings
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.errors import DomainError
from app.export.image import InvalidImage, clean_snapshot
from app.render.prompt import build_prompt

router = APIRouter(prefix="/api")
log = logging.getLogger(__name__)

# ASSUMPTION: configurable defaults (OPENAI_IMAGE_MODEL / OPENAI_IMAGE_QUALITY).
DEFAULT_IMAGE_MODEL = "gpt-image-2"
DEFAULT_IMAGE_QUALITY = "medium"
IMAGE_QUALITIES = {"low", "medium", "high"}
# Measured 2026-10-28: gpt-image-2 rejects input_fidelity (it always keeps the input closely);
# the gpt-image-1 family needs input_fidelity="high" to keep the layout.
FIDELITY_MODELS = ("gpt-image-1",)
IMAGE_SIZE = "1024x1536"  # portrait, like a wardrobe; the snapshot is captured at the same size
IMAGE_TIMEOUT_S = 120
MAX_BODY_BYTES = 3_000_000  # the design plus at most a 2 MB snapshot as base64
MAX_CONCURRENT_RENDERS = 2
# ASSUMPTION: cost guards, not business rules. Per client and for the whole worker.
CLIENT_LIMIT = (5, 600)  # 5 renders per 10 minutes
GLOBAL_LIMIT = (60, 3600)  # 60 renders per hour
TRUSTED_PROXY_ENVS = {"dev", "production"}  # behind Railway's proxy, which appends the client address
DISCLAIMER = {"he": "תמונה להמחשה בלבד, לא המודל התלת־ממדי המדויק", "en": "Illustrative image, not the accurate 3D model"}

MESSAGES = {
    "RENDER_UNAVAILABLE": {"he": "יצירת תמונות עדיין לא מוגדרת בשרת הזה.", "en": "Image rendering is not configured on this server."},
    "INVALID_REQUEST": {"he": "הבקשה אינה תקינה.", "en": "The request is not valid."},
    "TOO_LARGE": {"he": "הבקשה גדולה מדי.", "en": "The request is too large."},
    "INVALID_IMAGE": {"he": "תמונת הארון אינה תקינה.", "en": "The wardrobe picture is not valid."},
    "BUSY": {"he": "השרת עסוק ביצירת תמונות אחרות. נסה שוב בעוד רגע.", "en": "The server is busy with other renders. Please try again in a moment."},
    "RATE_LIMITED": {"he": "יצרת הרבה תמונות בזמן קצר. נסה שוב בעוד כמה דקות.", "en": "Too many renders in a short time. Please try again in a few minutes."},
    "RENDER_ERROR": {"he": "לא הצלחנו ליצור את התמונה כרגע. נסה שוב בעוד רגע.", "en": "The image could not be created right now. Please try again in a moment."},
}

_active_renders = 0  # only touched on the event loop thread
_recent: dict[str, deque[float]] = {}
_recent_all: deque[float] = deque()


class RenderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    design: dict
    image: Annotated[str, Field(max_length=2_700_000)]  # data:image/(png|jpeg);base64,...
    language: Literal["he", "en"] = "he"


def _fail(status: int, code: str, language: str, path: str | None = None) -> JSONResponse:
    return error(status, code, MESSAGES[code][language], path)


def client_key(request: Request, settings: Settings) -> str:
    """The caller's address. Behind Railway the last X-Forwarded-For entry is the one its proxy
    added; elsewhere the header is caller-controlled and ignored."""
    if settings.app_env in TRUSTED_PROXY_ENVS:
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
        if forwarded:
            return forwarded[:64]
    return request.client.host if request.client else "unknown"


def _allow(window: deque[float], limit: tuple[int, int], now: float) -> bool:
    count, seconds = limit
    while window and window[0] <= now - seconds:
        window.popleft()
    return len(window) < count


def take_slot(key: str, now: float | None = None) -> bool:
    """Record a render for `key` if both the client and the global window allow it."""
    now = time.monotonic() if now is None else now
    window = _recent.setdefault(key, deque())
    if not (_allow(window, CLIENT_LIMIT, now) and _allow(_recent_all, GLOBAL_LIMIT, now)):
        return False
    window.append(now)
    _recent_all.append(now)
    for stale in [k for k, w in _recent.items() if not w or w[-1] <= now - CLIENT_LIMIT[1]]:
        del _recent[stale]  # keep the map bounded by recent callers only
    return True


def reset_limits() -> None:
    """For tests."""
    _recent.clear()
    _recent_all.clear()


def _quality(settings: Settings) -> str:
    value = settings.openai_image_quality.strip()
    return value if value in IMAGE_QUALITIES else DEFAULT_IMAGE_QUALITY


def _generate(client: Any, settings: Settings, snapshot: bytes, prompt: str) -> str:
    model = settings.openai_image_model.strip() or DEFAULT_IMAGE_MODEL
    result = client.images.edit(
        model=model,
        image=("wardrobe.jpg", snapshot, "image/jpeg"),
        prompt=prompt,
        **({"input_fidelity": "high"} if model.startswith(FIDELITY_MODELS) else {}),
        size=IMAGE_SIZE,
        quality=_quality(settings),
        output_format="jpeg",
        n=1,
        timeout=IMAGE_TIMEOUT_S,
    )
    encoded = result.data[0].b64_json
    base64.b64decode(encoded, validate=True)  # must be real base64 before it reaches the page
    return f"data:image/jpeg;base64,{encoded}"


@router.post("/render")
async def render(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    client: Annotated[Any, Depends(get_llm_client)],
):
    body = await read_capped(request, MAX_BODY_BYTES)
    try:
        raw = json.loads(body) if body is not None else None
    except (ValueError, RecursionError):
        raw = None
    language = raw.get("language") if isinstance(raw, dict) and raw.get("language") in ("he", "en") else "he"
    if client is None:
        return _fail(503, "RENDER_UNAVAILABLE", language)
    if body is None:
        return _fail(413, "TOO_LARGE", language)
    try:
        parsed = RenderRequest.model_validate(raw)
    except ValidationError:
        return _fail(422, "INVALID_REQUEST", language)
    catalog = load_catalog()
    try:
        design = apply_ops(parsed.design, [], catalog)  # parse + fully validate, no ops
    except DomainError as exc:
        return error(422, exc.code, exc.message, exc.path)
    try:
        snapshot = await run_in_threadpool(clean_snapshot, parsed.image)
    except InvalidImage:
        return _fail(422, "INVALID_IMAGE", language, "image")
    global _active_renders
    if _active_renders >= MAX_CONCURRENT_RENDERS:
        response = _fail(503, "BUSY", language)
        response.headers["Retry-After"] = "5"
        return response
    if not take_slot(client_key(request, settings)):
        response = _fail(429, "RATE_LIMITED", language)
        response.headers["Retry-After"] = "60"
        return response
    _active_renders += 1
    try:
        # The OpenAI client is synchronous and slow (tens of seconds): keep it off the event loop.
        image = await run_in_threadpool(_generate, client, settings, snapshot, build_prompt(design, catalog))
    except Exception:  # upstream failure or no usable image; never echo upstream text to the customer
        log.exception("render failed")
        return _fail(502, "RENDER_ERROR", language)
    finally:
        _active_renders -= 1
    response = JSONResponse({"success": True, "data": {"image": image, "disclaimer": DISCLAIMER[language]}})
    response.headers["Cache-Control"] = "no-store"
    return response
