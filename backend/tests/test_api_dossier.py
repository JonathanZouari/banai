"""POST /api/dossier: validation, image checks, size caps, the render slots, and one real PDF."""

import base64
import io
import json
import threading

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader

from app.api import dossier
from app.api.dossier import COVER_MAX_SIDE, MAX_PNG_BYTES, get_pdf_renderer
from app.api.limits import MAX_DESIGN_NODES
from app.body_limit import DOSSIER_MAX_BODY_BYTES, MAX_BODY_BYTES
from app.domain.defaults import basic_wardrobe
from app.dossier.render import RenderError
from app.main import app
from tests.production.samples import png

client = TestClient(app)
PNG = base64.b64encode(png(4, 3)).decode()


@pytest.fixture
def calls():
    """A fake renderer in place of Chromium; returns the list of calls it received."""
    received = []
    app.dependency_overrides[get_pdf_renderer] = lambda: lambda *args: received.append(args) or b"%PDF-fake"
    yield received
    app.dependency_overrides.clear()


def post(design=None, render_png=None):
    body = {"design": basic_wardrobe() if design is None else design}
    if render_png is not None:
        body["renderPng"] = render_png
    return client.post("/api/dossier", json=body)


def test_returns_a_pdf():
    response = post(render_png=PNG)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == 'attachment; filename="banai-dossier.pdf"'
    assert response.content.startswith(b"%PDF")
    assert len(PdfReader(io.BytesIO(response.content)).pages) >= 8


def test_the_renderer_gets_the_canonical_design_and_the_decoded_png(calls):
    design = basic_wardrobe()
    design["schemaVersion"] = 1  # upgraded first
    assert post(design, f"data:image/png;base64,{PNG}").status_code == 200
    (canonical, catalog, image), = calls
    assert canonical == basic_wardrobe() and "colors" in catalog
    assert opened(image) == ("PNG", "RGB", (4, 3))  # re-encoded by the server, same picture


def test_an_invalid_design_is_a_422_with_the_engine_error(calls):
    design = basic_wardrobe()
    design["dimensions"]["width"] = 99999
    response = post(design)
    assert response.status_code == 422
    assert response.json() == {"success": False, "data": None,
                               "error": {"code": "OUT_OF_RANGE", "message": response.json()["error"]["message"],
                                         "path": "dimensions.width"}}
    broken = basic_wardrobe()
    del broken["doors"]
    assert post(broken).json()["error"]["code"] == "SCHEMA_INVALID"
    assert calls == []


def test_errors_never_echo_the_request(calls):
    design = basic_wardrobe()
    design["<script>alert(1)</script>"] = True
    response = post(design)
    assert response.status_code == 422 and "script" not in response.text
    response = post(render_png="<script>alert(1)</script>")
    assert response.status_code == 422 and "script" not in response.text


@pytest.mark.parametrize("bad", [
    "not base64 at all!",
    base64.b64encode(b"\xff\xd8\xff\xe0JFIF" + b"\x00" * 64).decode(),  # a JPEG
    base64.b64encode(b"\x89PNG\r\n\x1a\n").decode(),  # a signature and nothing else
    base64.b64encode(png(4, 3)[:12] + b"tEXt" + png(4, 3)[16:]).decode(),  # no IHDR first
    base64.b64encode(png(4, 3).replace(b"\x00\x00\x00\x04\x00\x00\x00\x03", b"\x00\x01\x00\x00\x00\x01\x00\x00", 1)).decode(),
])
def test_a_render_that_is_not_a_sane_png_is_rejected(calls, bad):
    response = post(render_png=bad)
    assert response.status_code == 422
    assert response.json()["error"] == {"code": "INVALID_IMAGE", "message": "renderPng must be a base64 PNG image.",
                                        "path": "renderPng"}
    assert calls == []


def test_a_png_over_2_mib_is_a_413(calls):
    big = base64.b64encode(png(4, 3) + b"\x00" * (MAX_PNG_BYTES - len(png(4, 3)) + 1)).decode()
    assert len(big) < DOSSIER_MAX_BODY_BYTES  # it passes the body cap; the route refuses it
    response = post(render_png=big)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"
    assert calls == []


def test_a_png_of_exactly_2_mib_is_accepted_and_reencoded(calls):
    exact = png(4, 3) + b"\x00" * (MAX_PNG_BYTES - len(png(4, 3)))
    assert post(render_png=base64.b64encode(exact).decode()).status_code == 200
    assert opened(calls[0][2]) == ("PNG", "RGB", (4, 3))  # the trailing bytes never reach Chromium


def encoded(image: Image.Image) -> str:
    out = io.BytesIO()
    image.save(out, format="PNG")
    return base64.b64encode(out.getvalue()).decode()


def opened(data: bytes) -> tuple:
    with Image.open(io.BytesIO(data)) as image:
        return image.format, image.mode, image.size


def test_a_declared_pixel_bomb_is_rejected_before_decoding(calls):
    header = png(4, 3).replace(b"\x00\x00\x00\x04\x00\x00\x00\x03", b"\x00\x00\x13\x88\x00\x00\x13\x88", 1)  # 5000 x 5000
    response = post(render_png=base64.b64encode(header).decode())
    assert response.status_code == 422 and response.json()["error"]["code"] == "INVALID_IMAGE"
    assert calls == []


def test_a_16_bit_or_transparent_png_becomes_8_bit_rgb(calls):
    assert post(render_png=encoded(Image.new("I;16", (64, 48), 30000))).status_code == 200
    assert post(render_png=encoded(Image.new("RGBA", (64, 48), (0, 0, 0, 0)))).status_code == 200
    assert [opened(call[2]) for call in calls] == [("PNG", "RGB", (64, 48))] * 2
    with Image.open(io.BytesIO(calls[1][2])) as image:
        assert image.getpixel((0, 0)) == (255, 255, 255)  # transparency lands on white paper


def test_a_large_render_is_scaled_to_the_cover_size(calls):
    assert post(render_png=encoded(Image.new("RGB", (2400, 1200), "grey"))).status_code == 200
    assert opened(calls[0][2]) == ("PNG", "RGB", (COVER_MAX_SIDE, COVER_MAX_SIDE // 2))


def test_a_corrupt_png_body_is_a_422_and_frees_its_slot(calls):
    broken = png(4, 3)[:-20] + b"\x00" * 20  # a valid header, broken image data
    response = post(render_png=base64.b64encode(broken).decode())
    assert response.status_code == 422 and response.json()["error"]["code"] == "INVALID_IMAGE"
    assert dossier._slots.acquire(blocking=False)
    dossier._slots.release()


@pytest.mark.parametrize("route", ["/api/dossier", "/api/advisories"])
def test_a_design_flooded_with_keys_is_refused_before_validation(calls, route):
    design = basic_wardrobe()
    design["carcass"].update({f"k{i}": 0 for i in range(MAX_DESIGN_NODES)})
    response = client.post(route, json={"design": design})
    assert response.status_code == 422
    assert response.json()["error"] == {"code": "SCHEMA_INVALID", "message": "the design is too large", "path": "design"}
    assert calls == []


def test_only_the_dossier_route_takes_bodies_over_1_mib(calls):
    padding = "A" * (2 * MAX_BODY_BYTES)  # valid base64, and not a PNG
    headers = {"Content-Type": "application/json"}
    body = json.dumps({"design": basic_wardrobe(), "renderPng": padding})
    response = client.post("/api/dossier", content=body, headers=headers)
    assert response.status_code == 422 and response.json()["error"]["code"] == "INVALID_IMAGE"  # reached the route
    response = client.post("/api/advisories", content=json.dumps({"design": basic_wardrobe(), "padding": padding}),
                           headers=headers)
    assert response.status_code == 413  # every other route keeps 1 MiB
    huge = json.dumps({"design": basic_wardrobe(), "renderPng": "A" * DOSSIER_MAX_BODY_BYTES})
    response = client.post("/api/dossier", content=huge, headers=headers)
    assert response.status_code == 413 and response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"
    assert calls == []


def test_a_full_renderer_answers_busy_at_once(calls, monkeypatch):
    full = threading.BoundedSemaphore(1)
    full.acquire()
    monkeypatch.setattr(dossier, "_slots", full)
    response = post()
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "BUSY"
    assert calls == []


def test_a_slot_is_released_after_each_request(calls, monkeypatch):
    monkeypatch.setattr(dossier, "_slots", threading.BoundedSemaphore(1))
    assert [post().status_code for _ in range(3)] == [200, 200, 200]
    assert len(calls) == 3


def test_a_failed_render_is_a_503_and_frees_its_slot(monkeypatch):
    def broken(*args):
        raise RenderError("chromium is missing")

    monkeypatch.setattr(dossier, "_slots", threading.BoundedSemaphore(1))
    app.dependency_overrides[get_pdf_renderer] = lambda: broken
    try:
        response = post()
        assert response.status_code == 503
        assert response.json()["error"] == {"code": "RENDER_FAILED", "message": "The dossier could not be rendered. Try again."}
        assert dossier._slots.acquire(blocking=False)
    finally:
        app.dependency_overrides.clear()


def test_the_body_must_carry_a_design():
    assert client.post("/api/dossier", json={}).status_code == 422
    assert client.post("/api/dossier", json={"design": basic_wardrobe(), "renderPng": 5}).status_code == 422
    assert client.get("/api/dossier").status_code == 405
