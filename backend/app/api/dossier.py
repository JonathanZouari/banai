"""POST /api/dossier: the carpenter's production dossier as a PDF (ADR-019). Read-only: the design is
validated and rendered, never stored. The optional render PNG goes on the cover.

Rendering starts a headless Chromium, so at most RENDER_SLOTS run per process. A request never waits for
a slot (that would pin a worker thread shared by every sync endpoint): it gets 429 BUSY at once.
"""

import base64
import binascii
import io
import logging
import struct
import threading

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, Response
from PIL import Image, UnidentifiedImageError
from typing import Literal

from pydantic import BaseModel

from app.api.limits import too_many_nodes

from app.domain.catalog import load_catalog
from app.domain.errors import DomainError
from app.domain.schema import parse_design
from app.domain.validation import validate_canonical
from app.dossier.render import RenderError, render_pdf

router = APIRouter(prefix="/api")
log = logging.getLogger(__name__)

MAX_PNG_BYTES = 2 * 1024 * 1024
MAX_PNG_SIDE = 8192  # pixels; a small file can still declare a huge image (decompression bomb)
MAX_PNG_PIXELS = 4096 * 4096  # decoded size: 64 MB as RGBA8, and only inside a render slot
COVER_MAX_SIDE = 1600  # the cover image is about 17 cm wide: 1600 px is past 200 dpi
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
DATA_URL_PREFIX = "data:image/png;base64,"
RENDER_SLOTS = 2
_slots = threading.BoundedSemaphore(RENDER_SLOTS)


class DossierRequest(BaseModel):
    design: dict
    renderPng: str | None = None
    # The carpenter's language (ADR-029); the dossier's direction follows it.
    language: Literal["he", "en", "ru", "ar"] = "he"


class InvalidPng(ValueError):
    pass


class PngTooLarge(ValueError):
    pass


def get_pdf_renderer():
    return render_pdf


def _error(status_code: int, code: str, message: str, path: str | None = None) -> JSONResponse:
    # Engine- or route-owned code, path and message only: nothing from the request is echoed back.
    error = {"code": code, "message": message} if path is None else {"code": code, "message": message, "path": path}
    return JSONResponse(status_code=status_code, content={"success": False, "data": None, "error": error})


def _invalid(error: DomainError) -> JSONResponse:
    return _error(422, error.code, error.message, error.path)


def decode_png(value: str) -> bytes:
    """A base64 PNG (optionally a data URL) of at most MAX_PNG_BYTES, with a sane declared size."""
    if value.startswith(DATA_URL_PREFIX):
        value = value[len(DATA_URL_PREFIX):]
    if len(value) > 4 * -(-MAX_PNG_BYTES // 3):  # longer than any base64 of MAX_PNG_BYTES
        raise PngTooLarge
    try:
        data = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise InvalidPng from None
    if len(data) > MAX_PNG_BYTES:
        raise PngTooLarge
    # Signature, then the IHDR chunk first: length 13, type, width, height.
    if len(data) < 24 or not data.startswith(PNG_SIGNATURE) or data[12:16] != b"IHDR":
        raise InvalidPng
    width, height = struct.unpack(">II", data[16:24])
    if not (0 < width <= MAX_PNG_SIDE and 0 < height <= MAX_PNG_SIDE and width * height <= MAX_PNG_PIXELS):
        raise InvalidPng
    return data


def normalize_png(data: bytes) -> bytes:
    """Decode with Pillow and re-encode as an 8-bit RGB PNG of at most COVER_MAX_SIDE, so Chromium only ever
    decodes an image this server made (no 16-bit or ancillary chunks, no attacker-chosen bytes)."""
    try:
        with Image.open(io.BytesIO(data), formats=["PNG"]) as image:
            if image.width * image.height > MAX_PNG_PIXELS:
                raise InvalidPng
            image.load()
            rgba = image.convert("RGBA")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, SyntaxError):
        raise InvalidPng from None
    rgb = Image.new("RGB", rgba.size, "white")
    rgb.paste(rgba, mask=rgba.getchannel("A"))
    rgb.thumbnail((COVER_MAX_SIDE, COVER_MAX_SIDE))
    out = io.BytesIO()
    rgb.save(out, format="PNG", optimize=False, compress_level=6)
    return out.getvalue()


def _filename(lang: str) -> str:
    return "banai-dossier.pdf" if lang == "he" else f"banai-dossier-{lang}.pdf"


@router.post("/dossier")
def post_dossier(body: DossierRequest, renderer=Depends(get_pdf_renderer)):
    if too_many_nodes(body.design):
        return _invalid(DomainError("SCHEMA_INVALID", "design", "the design is too large"))
    catalog = load_catalog()
    try:
        design = parse_design(body.design)
    except DomainError as error:
        return _invalid(error)
    issues = validate_canonical(design, catalog)
    if issues:
        return _invalid(issues[0])
    png = None
    if body.renderPng is not None:
        try:
            png = decode_png(body.renderPng)
        except PngTooLarge:
            return _error(413, "PAYLOAD_TOO_LARGE", "The render image is larger than 2 MiB.")
        except InvalidPng:
            return _error(422, "INVALID_IMAGE", "renderPng must be a base64 PNG image.", "renderPng")
    if not _slots.acquire(blocking=False):
        return _error(429, "BUSY", "Dossiers are being prepared. Try again in a moment.")
    try:
        # Decoded inside a slot, so at most RENDER_SLOTS images are in memory at once.
        if png is not None:
            png = normalize_png(png)
        pdf = renderer(design, catalog, png, **({"lang": body.language} if body.language != "he" else {}))
    except InvalidPng:
        return _error(422, "INVALID_IMAGE", "renderPng must be a base64 PNG image.", "renderPng")
    except RenderError:
        log.exception("dossier render failed")
        return _error(503, "RENDER_FAILED", "The dossier could not be rendered. Try again.")
    finally:
        _slots.release()
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{_filename(body.language)}"',
                             "Cache-Control": "no-store"})
