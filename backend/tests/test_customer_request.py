"""Stage 5: the optional customer request (notes + the measured wall) saved with a design and printed
in the carpenter PDF. Additive: everything without it behaves as before. Never contains the photo."""

import io
import json

import httpx2
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.api import designs as designs_api
from app.api.customer_request import MAX_NOTES, CustomerRequest
from app.domain.defaults import basic_wardrobe
from app.main import app
from app.persistence.repository import InMemoryRepository, SupabaseRepository

client = TestClient(app)

REQUEST = {
    "notes": "ידיות שחורות\nמקום לשואב אבק",
    "room": {"width": 2500, "height": 2600, "depth": 650, "obstacles": ["window"], "obstacleNotes": "חלון מימין", "style": "קירות לבנים"},
}


@pytest.fixture
def store(monkeypatch):
    repository = InMemoryRepository()
    monkeypatch.setattr(designs_api, "get_repository", lambda: repository)
    return repository


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def pdf_text(pdf: bytes) -> str:
    return "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf)).pages)


# --- saving and reopening ----------------------------------------------------------------

def test_the_request_is_saved_and_comes_back_with_the_design(store):
    created = client.post("/api/designs", json={"design": basic_wardrobe(), "request": REQUEST}).json()["data"]
    opened = client.get(f"/api/designs/{created['designId']}", headers=bearer(created["accessToken"])).json()["data"]
    assert opened["request"] == REQUEST
    assert "photo" not in json.dumps(opened)


def test_a_save_without_a_request_keeps_the_stored_one_and_old_clients_still_work(store):
    created = client.post("/api/designs", json={"design": basic_wardrobe(), "request": REQUEST}).json()["data"]
    url, auth = f"/api/designs/{created['designId']}", bearer(created["accessToken"])
    assert client.put(url, json={"design": basic_wardrobe()}, headers={**auth, "If-Match": "1"}).status_code == 200
    assert client.get(url, headers=auth).json()["data"]["request"] == REQUEST
    changed = {**REQUEST, "notes": "רק מראה על הדלת"}
    assert client.put(url, json={"design": basic_wardrobe(), "request": changed}, headers={**auth, "If-Match": "2"}).status_code == 200
    assert client.get(url, headers=auth).json()["data"]["request"]["notes"] == "רק מראה על הדלת"


def test_a_design_saved_without_a_request_has_none(store):
    created = client.post("/api/designs", json={"design": basic_wardrobe()}).json()["data"]
    opened = client.get(f"/api/designs/{created['designId']}", headers=bearer(created["accessToken"])).json()["data"]
    assert "request" not in opened


def test_the_request_is_behind_the_same_token(store):
    created = client.post("/api/designs", json={"design": basic_wardrobe(), "request": REQUEST}).json()["data"]
    response = client.get(f"/api/designs/{created['designId']}", headers=bearer("A" * 43))
    assert response.status_code == 404
    assert "ידיות" not in response.text


def test_a_stored_request_that_no_longer_validates_is_left_out(store):
    created = client.post("/api/designs", json={"design": basic_wardrobe()}).json()["data"]
    row = store.get(created["designId"])
    store._rows[created["designId"]] = type(row)(row.token_hash, row.name, row.design, row.revision, {"notes": 5})
    opened = client.get(f"/api/designs/{created['designId']}", headers=bearer(created["accessToken"]))
    assert opened.status_code == 200
    assert "request" not in opened.json()["data"]


# --- validation (untrusted input) ---------------------------------------------------------

HIDDEN = chr(0x202E)  # a right-to-left override: it can reorder text in the PDF


@pytest.mark.parametrize("bad", [
    {"notes": "x" * (MAX_NOTES + 1)},
    {"notes": f"ok{HIDDEN}"},
    {"notes": f"a{chr(13)}b"},  # the frontend turns CR/CRLF into a plain newline before sending
    {"notes": 5},
    {"room": {"width": 9}},
    {"room": {"width": 20_001}},
    {"room": {"width": "2500"}},  # strict: no strings for numbers
    {"room": {"width": 2500.5}},
    {"room": {"obstacles": ["window", "window"]}},
    {"room": {"obstacles": ["pool"]}},
    {"room": {"style": "x" * 301}},
    {"room": {"obstacle_notes": "snake_case key"}},
    {"room": {"photo": "data:image/png;base64,AAAA"}},  # there is no place for a photo
    {"extra": True},
])
def test_invalid_requests_are_rejected(store, bad):
    response = client.post("/api/designs", json={"design": basic_wardrobe(), "request": bad})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_empty_and_minimal_requests_are_fine():
    assert CustomerRequest.model_validate({}).is_empty()
    assert CustomerRequest.model_validate({"notes": "  ", "room": {}}).is_empty()
    assert not CustomerRequest.model_validate({"room": {"obstacles": ["door"]}}).is_empty()
    assert CustomerRequest.model_validate(REQUEST).to_json() == REQUEST


# --- Supabase ----------------------------------------------------------------------------

def supabase(handler):
    return SupabaseRepository("https://example.supabase.co", "sb_secret_test", client=httpx2.Client(transport=httpx2.MockTransport(handler)))


def test_supabase_writes_the_request_to_the_customer_column_only_when_given():
    sent = []

    def handler(request):
        sent.append(json.loads(request.content))
        return httpx2.Response(201, json=[{"id": "abc", "revision": 1}])

    repository = supabase(handler)
    repository.create("f" * 64, "Wardrobe", {"a": 1}, REQUEST)
    repository.create("f" * 64, "Wardrobe", {"a": 1})
    assert sent[0]["customer"] == REQUEST
    assert "customer" not in sent[1]


def test_supabase_reads_the_customer_column():
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx2.Response(200, json=[{"token_hash": "f" * 64, "name": "W", "design": {}, "revision": 2, "customer": REQUEST}])

    saved = supabase(handler).get("abc")
    assert saved.customer == REQUEST
    assert "customer" in seen[0]


# --- the carpenter PDF -------------------------------------------------------------------

def export(language="en", request=None):
    body = {"design": basic_wardrobe(), "language": language}
    if request is not None:
        body["request"] = request
    return client.post("/api/export/pdf", json=body)


def test_the_pdf_gets_a_customer_page_with_the_notes_and_the_measured_wall():
    plain = export("en")
    with_request = export("en", {"notes": "Black handles\nRoom for a vacuum cleaner", "room": {"width": 1800, "obstacles": ["window"]}})
    assert with_request.status_code == 200
    pages = len(PdfReader(io.BytesIO(with_request.content)).pages)
    assert pages == len(PdfReader(io.BytesIO(plain.content)).pages) + 1
    text = pdf_text(with_request.content)
    assert "Customer requirements" in text
    assert "Black handles" in text
    assert "Room for a vacuum cleaner" in text
    assert "wardrobe 200 larger" in text  # 2000 mm wardrobe vs an 1800 mm wall: size only
    assert "not measured" in text
    assert "Window" in text
    assert "were not checked on site" in text


def test_an_empty_request_adds_no_page():
    plain = len(PdfReader(io.BytesIO(export("en").content)).pages)
    empty = len(PdfReader(io.BytesIO(export("en", {"notes": "", "room": {}}).content)).pages)
    assert empty == plain


def test_the_hebrew_customer_page_renders():
    response = export("he", REQUEST)
    assert response.status_code == 200
    text = pdf_text(response.content)
    assert "חלון" in text or "ןולח" in text  # pypdf may return visual (reversed) order for RTL text


def test_the_spanish_customer_page_renders():
    # Spanish PDFs (from dev) meet the customer page (this branch): every text must exist in both.
    response = export("es", {"notes": "Tiradores negros", "room": {"width": 1800, "height": 2600, "obstacles": ["window", "beam"]}})
    assert response.status_code == 200
    text = pdf_text(response.content)
    assert "Requisitos del cliente" in text
    assert "Tiradores negros" in text
    assert "Ventana" in text
    assert "no se comprobaron en obra" in text


def test_an_invalid_request_is_rejected_before_rendering():
    response = export("en", {"notes": f"x{HIDDEN}"})
    assert response.status_code == 422
