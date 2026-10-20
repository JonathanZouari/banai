"""Carpenter instructions PDF for a finished design (scope change 2026-10-20).

POST /api/carpentry/pdf {design, revision, language, images: {closed, open}} -> application/pdf.
The design is validated by the domain engine, the plan is derived from it on the server, and
the two images are optional PNG snapshots of the 3D view. Nothing is stored.
"""

from __future__ import annotations

import base64
import binascii
import io
from typing import Annotated

from fastapi import APIRouter
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field

from app.agent.language import Language
from app.api.agent import _canonical, error
from app.domain.carpentry import build_plan
from app.domain.catalog import load_catalog
from app.domain.errors import DomainError
from app.services.carpentry_pdf import render_pdf

router = APIRouter(prefix="/api/carpentry")

MAX_IMAGE_BYTES = 1_500_000
MAX_IMAGE_SIDE = 2048
PNG_PREFIX = "data:image/png;base64,"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
# base64 inflates by 4/3; the data-URL string cap follows the byte cap.
MAX_DATA_URL_CHARS = len(PNG_PREFIX) + (MAX_IMAGE_BYTES * 4) // 3 + 4

MESSAGES = {
    "BAD_IMAGE": {"he": "תמונת התצוגה אינה תקינה.", "en": "The view snapshot is not a valid PNG image."},
}


class Snapshots(BaseModel):
    model_config = ConfigDict(extra="forbid")
    closed: Annotated[str, Field(max_length=MAX_DATA_URL_CHARS)] | None = None
    open: Annotated[str, Field(max_length=MAX_DATA_URL_CHARS)] | None = None


class PdfRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    design: dict
    revision: Annotated[int, Field(ge=1, le=1_000_000_000)]
    language: Language = "he"
    images: Snapshots = Snapshots()


class BadImage(ValueError):
    pass


def decode_png(data_url: str | None) -> bytes | None:
    """Decode a PNG data URL; reject anything that is not a small, well-formed PNG."""
    if data_url is None:
        return None
    if not data_url.startswith(PNG_PREFIX):
        raise BadImage
    try:
        raw = base64.b64decode(data_url[len(PNG_PREFIX):], validate=True)
    except (binascii.Error, ValueError):
        raise BadImage from None
    if len(raw) > MAX_IMAGE_BYTES or not raw.startswith(PNG_MAGIC):
        raise BadImage
    try:
        with Image.open(io.BytesIO(raw)) as image:  # reads the header only
            if image.format != "PNG" or max(image.size) > MAX_IMAGE_SIDE:
                raise BadImage
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise BadImage from None
    return raw


@router.post("/pdf")
def carpentry_pdf(request: PdfRequest):
    catalog = load_catalog()
    try:
        design = _canonical(request.design, catalog)
    except DomainError as exc:
        return error(422, exc.code, exc.message, exc.path)
    try:
        images = {"closed": decode_png(request.images.closed), "open": decode_png(request.images.open)}
    except BadImage:
        return error(422, "BAD_IMAGE", MESSAGES["BAD_IMAGE"][request.language])
    pdf = render_pdf(build_plan(design, catalog), language=request.language, revision=request.revision, images=images)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="banai-carpenter-r{request.revision}.pdf"',
                 "Cache-Control": "no-store"},
    )
