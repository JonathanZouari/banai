"""Customer details in the dossier (ADR-038): checked on the way in, used for one PDF, never echoed or logged."""

import logging
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.api.dossier import get_pdf_renderer
from app.domain.defaults import basic_wardrobe
from app.dossier.customer import Customer
from app.dossier.render import build, render_html
from app.main import app
from tests.dossier.test_i18n import DESIGN_CATALOG, HEBREW

CUSTOMER = {"name": "דנה לוי", "phone": "+972 52-123-4567", "email": "dana@example.com", "address": "הרצל 12",
            "city": "חיפה", "floor": 4, "elevator": False, "contactTimes": "אחרי 17:00", "installDate": "2026-11-20",
            "notes": "חניה ברחוב בלבד"}


@pytest.fixture
def calls():
    received = []
    app.dependency_overrides[get_pdf_renderer] = lambda: lambda *args, **kwargs: received.append(kwargs) or b"%PDF-fake"
    yield received
    app.dependency_overrides.clear()


def post(**body):
    return TestClient(app).post("/api/dossier", json={"design": basic_wardrobe(), **body})


def test_the_details_reach_the_renderer_and_empty_ones_do_not(calls):
    assert post(customer=CUSTOMER).status_code == 200
    assert post(customer={}).status_code == 200
    assert post().status_code == 200
    given, empty, none = calls
    assert given["customer"]["name"] == "דנה לוי" and given["customer"]["install_date"] == date(2026, 11, 20)
    assert empty == {} and none == {}


@pytest.mark.parametrize("field, value", [
    ("email", "not-an-email"), ("phone", "call me"), ("name", "x" * 61), ("name", "   "), ("name", "a\u202eb"),
    ("notes", "line\nbreak"), ("floor", 999), ("installDate", "tomorrow"), ("ssn", "123"), ("elevator", "yes"),
    ("email", "da\u202ena@example.com"), ("phone", "052\u200b1234567"), ("installDate", "1899-12-31"),
])
def test_bad_details_are_refused_without_echoing_them(calls, field, value, caplog):
    with caplog.at_level(logging.DEBUG):
        response = post(customer={**CUSTOMER, field: value})
    assert response.status_code == 422 and response.json()["error"]["code"] == "INVALID_REQUEST"
    assert str(value) not in response.text and "דנה" not in response.text
    assert "דנה" not in caplog.text and not calls


def test_the_site_page_lists_the_details_escaped():
    customer = Customer.model_validate({**CUSTOMER, "name": "<b>דנה</b>"}).model_dump()
    html = render_html(build(basic_wardrobe(), DESIGN_CATALOG, None, date(2026, 10, 19), "he", customer))
    assert "פרטי לקוח" in html and "&lt;b&gt;דנה&lt;/b&gt;" in html and "<b>דנה" not in html
    context = build(basic_wardrobe(), DESIGN_CATALOG, None, date(2026, 10, 19), "he", customer)
    assert [p["kind"] for p in context["pages"]][:2] == ["cover", "customer"]  # a page of its own, after the cover
    assert context["pages"][1]["notes"] == "חניה ברחוב בלבד" and "חניה ברחוב בלבד" in html
    assert "הרצל 12, חיפה" in html and "קומה 4, אין מעלית" in html and "20 בנובמבר 2026" in html
    assert "פרטי לקוח" not in render_html(build(basic_wardrobe(), DESIGN_CATALOG, None, date(2026, 10, 19), "he"))


@pytest.mark.parametrize("lang", ["en", "ru", "ar"])
def test_a_foreign_dossier_translates_the_labels_and_keeps_the_values(lang):
    customer = Customer.model_validate({"name": "Dana Levi", "phone": "052-1234567", "floor": 2, "elevator": True,
                                        "installDate": "2026-11-20", "notes": "Parking on the street"}).model_dump()
    html = render_html(build(basic_wardrobe(), DESIGN_CATALOG, None, date(2026, 10, 19), lang, customer))
    assert "Dana Levi" in html and "052-1234567" in html and "Parking on the street" in html
    assert not HEBREW.search(html)
