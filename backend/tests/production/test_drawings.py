"""Shop drawings (app.production.drawings): well-formed, escaped SVG with the RTL fixes of P2."""

import re
import xml.etree.ElementTree as ET

import pytest

from app.domain.defaults import basic_wardrobe
from app.domain.layout import layout
from app.dossier.render import build, ltr_runs, render_html
from app.production import drawings
from app.production.nesting import nest
from app.production.parts import production
from tests.production.samples import CATALOG, DESIGNS, hinged, make

EVIL = '<script>alert("x")</script> & co'
SVG = "{http://www.w3.org/2000/svg}"


def evil_design() -> dict:
    custom = {"custom": True, "name": EVIL, "hex": "#9caf88"}
    return make(hinged(), {"op": "set_material", "target": "carcass", "color": custom},
                {"op": "set_material", "target": "doors", "material": custom})


def all_svgs(design: dict) -> list[str]:
    lay, prod = layout(design), production(design, CATALOG)
    nesting = nest(prod.parts)
    by_no = {p.no: p for p in prod.parts}
    out = [drawings.front_elevation(design, lay, CATALOG), drawings.interior_elevation(design, lay),
           drawings.plan_view(design, lay, CATALOG, prod.partition_depth), drawings.exploded_view(prod)]
    out += [drawings.compartment_elevation(design, lay, i) for i in range(len(lay.ranges))]
    out += [drawings.sheet_drawing(s, by_no, uid=f"sh{k}") for k, s in enumerate(nesting.sheets)]
    out += [drawings.edge_glyph(p) for p in prod.parts]
    return [str(s) for s in out]


@pytest.mark.parametrize("name", DESIGNS)
def test_every_drawing_is_well_formed_svg(name):
    for svg in all_svgs(DESIGNS[name]()):
        root = ET.fromstring(svg)
        assert root.tag == f"{SVG}svg"


def test_a_custom_name_is_escaped_in_the_svg():
    svgs = all_svgs(evil_design())
    titles = [t.text for svg in svgs for t in ET.fromstring(svg).iter(f"{SVG}text") if t.text and "co" in t.text]
    assert any(EVIL in title for title in titles)  # survives as text, after XML parsing
    joined = "".join(svgs)
    assert "<script" not in joined
    assert "&lt;script&gt;alert(&#34;x&#34;)&lt;/script&gt; &amp; co" in joined


def test_a_custom_name_is_escaped_in_the_html():
    html = render_html(build(evil_design(), CATALOG))
    assert "<script" not in html
    assert html.count("&lt;script&gt;") >= 5  # cut list, boards table, cover, sheets, estimate


def test_numbers_read_left_to_right_and_the_sheet_titles_swap_anchors():
    design = basic_wardrobe()
    lay, prod = layout(design), production(design, CATALOG)
    root = ET.fromstring(str(drawings.front_elevation(design, lay, CATALOG)))
    dims = [t for t in root.iter(f"{SVG}text") if "dim-text" in t.get("class", "")]
    assert dims and all(t.get("direction") == "ltr" for t in dims)
    sheet = nest(prod.parts).sheets[0]
    texts = list(ET.fromstring(str(drawings.sheet_drawing(sheet, {p.no: p for p in prod.parts}))).iter(f"{SVG}text"))
    title, used = texts[-2], texts[-1]
    assert (title.get("x"), title.get("text-anchor")) == ("2440", "start")  # the right edge on an RTL page
    assert (used.get("x"), used.get("text-anchor")) == ("0", "end")
    assert "\u20662440×1220\u2069" in title.text


def test_drawing_ids_are_unique_in_the_whole_dossier():
    html = render_html(build(DESIGNS["rich"](), CATALOG))
    ids = re.findall(r' id="([^"]+)"', html)
    assert ids and len(ids) == len(set(ids))
    for ref in set(re.findall(r"url\(#([^)]+)\)", html)):
        assert ref in ids


def test_compartments_follow_the_physical_order():
    html = render_html(build(DESIGNS["rich"](), CATALOG))
    captions = re.findall(r'<figcaption dir="rtl">תא (\d+)', html)
    assert captions == ["1", "2", "3", "4"]
    assert re.search(r"\.fig-row \{[^}]*direction: ltr", html)


def test_open_compartments_show_their_interior_in_the_front_view():
    design = make({"op": "configure_doors", "type": "hinged",
                   "doors": [{"id": "dr_a", "compartmentIds": ["cmp_a"], "hingeSide": "left"}]},
                  {"op": "add_shelf", "compartmentId": "cmp_b", "y": 900, "id": "shf_b"})
    svg = str(drawings.front_elevation(design, layout(design), CATALOG))
    assert svg.count('class="shelf"') == 1 and svg.count('class="front"') == 1


def test_number_ranges_are_isolated_left_to_right():
    assert str(ltr_runs("דפנות 11–16 מ״מ <b>")) == 'דפנות <span class="num">11–16</span> מ״מ &lt;b&gt;'
    assert str(ltr_runs("לוח 244×122")) == 'לוח <span class="num">244×122</span>'
    assert str(ltr_runs("ו-28 כעבה")) == "ו-28 כעבה"
