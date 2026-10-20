"""Render a carpenter plan (app/domain/carpentry.py) as an A4 PDF, in Hebrew (RTL) or English.

fpdf2 with HarfBuzz text shaping; fonts are bundled (app/assets/fonts, SIL OFL). Every text
from the design (custom material names) is written as plain text, never interpreted. Images
are PNG snapshots of the 3D view, already validated by the caller.
"""

from __future__ import annotations

import io
from datetime import date
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from fpdf.fonts import FontFace
from PIL import Image

from app.services.carpentry_text import TEXT

FONTS = Path(__file__).resolve().parent.parent / "assets" / "fonts"
INK = (35, 26, 22)
MUTED = (110, 98, 92)
ACCENT = (142, 76, 50)
LINE = (200, 188, 182)
FILL = (247, 241, 238)
PANEL_FILL = (226, 214, 206)
NOTICE_FILL = (255, 236, 230)
NEXT = {"new_x": XPos.LMARGIN, "new_y": YPos.NEXT}


class CarpentryPdf(FPDF):
    def __init__(self, language: str) -> None:
        super().__init__(format="A4", unit="mm")
        self.language = language
        self.t = TEXT[language]
        self.rtl = language == "he"
        self.set_margins(15, 15, 15)
        self.set_auto_page_break(auto=True, margin=18)
        for family, file in (("Noto", "NotoSans"), ("NotoHe", "NotoSansHebrew")):
            self.add_font(family, "", FONTS / f"{file}-Regular.ttf")
            self.add_font(family, "B", FONTS / f"{file}-Bold.ttf")
        self.set_fallback_fonts(["NotoHe"])
        self.set_text_shaping(use_shaping_engine=True, direction="rtl" if self.rtl else "ltr")
        self.set_text_color(*INK)

    @property
    def align(self) -> str:
        return "R" if self.rtl else "L"

    def font(self, size: float, bold: bool = False, color: tuple = INK) -> None:
        self.set_font("Noto", "B" if bold else "", size)
        self.set_text_color(*color)

    def footer(self) -> None:
        self.set_y(-12)
        self.font(7.5, color=MUTED)
        self.cell(0, 5, self.t["footer"].format(page=self.page_no()), align="C")

    def heading(self, text: str, size: float = 13) -> None:
        self.ln(2)
        self.font(size, bold=True, color=ACCENT)
        self.multi_cell(0, 7, text, align=self.align, **NEXT)
        self.ln(1)

    def para(self, text: str, size: float = 9.5, color: tuple = INK) -> None:
        self.font(size, color=color)
        self.multi_cell(0, 5, text, align=self.align, **NEXT)

    def table(self, headings: list[str] | None, rows: list[list[str]], widths: list[float], size: float = 8) -> None:
        """A simple bordered table; columns are mirrored for right-to-left documents."""
        order = list(range(len(widths)))
        if self.rtl:
            order.reverse()
        self.set_draw_color(*LINE)
        self.font(size)
        style = FontFace(emphasis="BOLD", fill_color=FILL)
        with super().table(col_widths=[widths[i] for i in order], text_align=self.align,
                           line_height=size * 0.55, headings_style=style,
                           first_row_as_headings=headings is not None) as table:
            for values in ([headings] if headings else []) + rows:
                row = table.row()
                for i in order:
                    row.cell(values[i])
        self.ln(2)

    def image_box(self, png: bytes | None, width: float, caption: str) -> None:
        """Centre an image (keeping its aspect ratio), shrunk to fit the space left on the page."""
        if not png:
            return
        with Image.open(io.BytesIO(png)) as image:
            aspect = image.height / image.width
        available = self.h - self.b_margin - self.get_y() - 8  # leave room for the caption
        if available < 40:
            self.add_page()
            available = self.h - self.b_margin - self.get_y() - 8
        width = min(width, available / aspect)
        self.image(io.BytesIO(png), x=(self.w - width) / 2, y=self.get_y(), w=width)
        self.set_y(self.get_y() + width * aspect + 1)
        self.font(8, color=MUTED)
        self.cell(0, 5, caption, align="C", **NEXT)


def _mm(value: int) -> str:
    return str(value)


def ltr(text: str) -> str:
    """Keep a run of numbers and symbols in left-to-right order inside Hebrew text (bidi isolate)."""
    return f"⁦{text}⁩"


def _cm(value: int) -> str:
    return f"{value / 10:.1f}"


def render_pdf(plan: dict, *, language: str, revision: int, images: dict[str, bytes | None],
               today: date | None = None) -> bytes:
    pdf = CarpentryPdf(language)
    t = pdf.t
    dims = plan["dimensions"]
    counts = plan["counts"]

    # Page 1: cover, summary, closed view, notice.
    pdf.add_page()
    pdf.font(22, bold=True, color=ACCENT)
    pdf.cell(0, 11, t["title"], align=pdf.align, **NEXT)
    pdf.font(10, color=MUTED)
    pdf.cell(0, 6, t["subtitle"].format(revision=revision, date=(today or date.today()).isoformat()),
             align=pdf.align, **NEXT)
    pdf.ln(3)
    pdf.set_fill_color(*NOTICE_FILL)
    pdf.font(10, bold=True)
    pdf.multi_cell(0, 6, t["notice_title"], align=pdf.align, fill=True, **NEXT)
    pdf.font(8.5)
    pdf.multi_cell(0, 4.6, t["notice"], align=pdf.align, fill=True, padding=(0, 2, 2, 2), **NEXT)
    pdf.heading(t["summary"])
    door_text = t["door_types"][plan["doorType"]].format(n=counts["doors"])
    summary = [
        (t["overall"], ltr(f"{_mm(dims['width'])} × {_mm(dims['height'])} × {_mm(dims['depth'])} mm") + "  "
                       + ltr(f"({_cm(dims['width'])} × {_cm(dims['height'])} × {_cm(dims['depth'])} cm)")),
        (t["panel"], t["mm"].format(value=plan["panelThickness"])),
        (t["interior"], ltr(f"{_mm(plan['interior']['width'])} × {_mm(plan['interior']['height'])} mm")),
        (t["doors"], door_text),
        (t["contents"], t["contents_value"].format(compartments=len(plan["compartments"]), **counts)),
        (t["body_material"], plan["materials"]["body"]),
        (t["door_material"], plan["materials"]["doors"] if plan["doorType"] != "none" else "-"),
    ]
    pdf.table(None, [[k, v] for k, v in summary], [55, 125], size=9)
    pdf.image_box(images.get("closed"), 120, t["view_closed"])

    # Page 2: front elevation drawing + interior view.
    pdf.add_page()
    pdf.heading(t["drawing"])
    pdf.para(t["drawing_note"], size=8, color=MUTED)
    _draw_elevation(pdf, plan, top=pdf.get_y() + 8, max_w=150, max_h=150)
    pdf.image_box(images.get("open"), 85, t["view_open"])

    # Cut list.
    pdf.add_page()
    pdf.heading(t["cut_list"])
    rows = []
    for number, part in enumerate(sorted(plan["parts"], key=lambda p: (p["material"], -p["thickness"])), start=1):
        rows.append([str(number), t["parts"][part["kind"]], str(part["qty"]), _mm(part["length"]),
                     _mm(part["width"]), str(part["thickness"]), part["material"], _note(part, t)])
    pdf.table(t["cols"], rows, [7, 27, 10, 15, 15, 10, 44, 52], size=7.5)

    # Hardware, banding, assembly order, assumptions.
    pdf.heading(t["hardware"])
    hw_rows = [[t["hw"][item["kind"]].format(size=item["size"]), str(item["qty"])] for item in plan["hardware"]]
    pdf.table(t["hw_cols"], hw_rows, [150, 30], size=8.5)
    waste = plan["assumptions"]["edgeBandingWastePercent"]
    pdf.para(t["banding"].format(waste=waste, meters=plan["edgeBandingMeters"]))

    pdf.heading(t["steps"])
    for number, step in enumerate(_steps(plan, t), start=1):
        pdf.para(f"{number}. {step}")
        pdf.ln(0.8)

    pdf.heading(t["assumptions"])
    a_rows = [[t["assumption"][key], str(value)] for key, value in plan["assumptions"].items()]
    a_rows.append([t["assumption"]["hinges"], t["assumption"]["hinges_value"]])
    pdf.table(t["as_cols"], a_rows, [130, 50], size=8)
    return bytes(pdf.output())


def _note(part: dict, t: dict) -> str:
    p, notes = part["params"], t["notes"]
    kind = part["kind"]
    if kind == "partition":
        return notes["partition"].format(a=p["between"][0], b=p["between"][1], x=_mm(p["x"]))
    if kind == "shelf":
        return notes["shelf"].format(compartment=p["compartment"], y=ltr(", ".join(_mm(y) for y in p["y"])))
    if kind.startswith("drawer"):
        return notes["drawer"].format(compartment=p["compartment"], y=_mm(p["y"]))
    if kind == "door":
        return notes["door"].format(compartments=ltr(", ".join(map(str, p["compartments"]))),
                                    side=t["sides"][p["hinge_side"]], hinges=ltr(", ".join(_mm(h) for h in p["hinges"])))
    if kind == "back":
        return notes["back"]
    return ""


def _steps(plan: dict, t: dict) -> list[str]:
    s, a, counts = t["step"], plan["assumptions"], plan["counts"]
    parts_total = sum(part["qty"] for part in plan["parts"])
    steps = [s["verify"], s["cut"].format(n=parts_total, m=plan["edgeBandingMeters"]), s["drill"]]
    if plan["doorType"] == "hinged":
        steps.append(s["drill_hinges"])
    steps.append(s["carcass"])
    if plan["partitions"]:
        steps.append(s["partitions"].format(xs=ltr(", ".join(_mm(p["x"]) for p in plan["partitions"]))))
    steps.append(s["back"])
    if plan["rails"]:
        items = [s["rail_item"].format(compartment=r["compartment"], y=_mm(r["y"]), length=_mm(r["length"]))
                 for r in plan["rails"]]
        steps.append(s["rails"].format(list="; ".join(items)))
    if counts["drawers"]:
        steps.append(s["drawers"].format(n=counts["drawers"], runner=plan["runnerLength"], gap=a["drawerFrontGap"]))
    if counts["shelves"]:
        steps.append(s["shelves"].format(n=counts["shelves"]))
    if plan["doorType"] == "hinged":
        steps.append(s["doors_hinged"].format(n=counts["doors"], gap=a["doorGap"]))
    elif plan["doorType"] == "sliding":
        steps.append(s["doors_sliding"].format(n=counts["doors"], width=_mm(plan["dimensions"]["width"])))
    steps.append(s["final"])
    return steps


def _draw_elevation(pdf: CarpentryPdf, plan: dict, *, top: float, max_w: float, max_h: float) -> None:
    """Vector front view to scale: carcass, partitions, shelves, drawers, rails, with dimensions."""
    width, height = plan["dimensions"]["width"], plan["dimensions"]["height"]
    panel = plan["panelThickness"]
    scale = min(max_w / width, max_h / height)
    w, h = width * scale, height * scale
    left = (pdf.w - w) / 2
    y_of = lambda y_ext: top + h - y_ext * scale  # noqa: E731 - exterior mm from the floor -> page y
    x_of = lambda x_ext: left + x_ext * scale  # noqa: E731

    pdf.set_line_width(0.3)
    pdf.set_draw_color(*INK)
    pdf.set_fill_color(*FILL)
    pdf.rect(left, top, w, h, style="DF")
    pdf.set_fill_color(*PANEL_FILL)
    for x0, x1 in ((0, panel), (width - panel, width)):
        pdf.rect(x_of(x0), top, (x1 - x0) * scale, h, style="DF")
    for y0 in (0, height - panel):
        pdf.rect(x_of(panel), y_of(y0 + panel), (width - 2 * panel) * scale, panel * scale, style="DF")
    for partition in plan["partitions"]:
        pdf.rect(x_of(partition["x"]), y_of(height - panel), partition["thickness"] * scale,
                 (height - 2 * panel) * scale, style="DF")

    pdf.set_text_shaping(use_shaping_engine=True, direction="ltr")
    pdf.font(6, color=MUTED)
    for comp in plan["compartments"]:
        cx, cw = comp["x"], comp["width"]
        for y in comp["shelves"]:
            pdf.set_fill_color(*PANEL_FILL)
            pdf.rect(x_of(cx), y_of(panel + y + 18), cw * scale, max(0.5, 18 * scale), style="DF")
            _label(pdf, x_of(cx) + 0.8, y_of(panel + y + 18) - 2.6, f"y {y}")
        for y, dh in comp["drawers"]:
            pdf.set_fill_color(255, 255, 255)
            pdf.rect(x_of(cx + 3), y_of(panel + y + dh - 3), (cw - 6) * scale, (dh - 3) * scale, style="DF")
            mid = x_of(cx + cw / 2)
            pdf.line(mid - 3, y_of(panel + y + dh / 2), mid + 3, y_of(panel + y + dh / 2))
            _label(pdf, x_of(cx) + 0.8, y_of(panel + y + dh) + 0.4, f"y {y} / h {dh}")
        for y in comp["rails"]:
            pdf.set_draw_color(*ACCENT)
            pdf.set_line_width(0.6)
            pdf.line(x_of(cx + 5), y_of(panel + y), x_of(cx + cw - 5), y_of(panel + y))
            pdf.set_line_width(0.3)
            pdf.set_draw_color(*INK)
            _label(pdf, x_of(cx) + 0.8, y_of(panel + y) - 2.8, f"rail y {y}")

    # Dimension lines: overall width (top), overall height (left), compartment widths (bottom).
    pdf.set_draw_color(*MUTED)
    pdf.set_line_width(0.2)
    pdf.font(7, bold=True)
    pdf.line(left, top - 4, left + w, top - 4)
    _label(pdf, left + w / 2 - 6, top - 8, f"{width}")
    pdf.line(left - 4, top, left - 4, top + h)
    _label(pdf, left - 14, top + h / 2 - 2, f"{height}")
    pdf.font(6.5)
    for comp in plan["compartments"]:
        x0 = x_of(comp["x"])
        pdf.line(x0, top + h + 3, x0 + comp["width"] * scale, top + h + 3)
        _label(pdf, x0 + comp["width"] * scale / 2 - 4, top + h + 4, f"{comp['width']}")
    pdf.set_y(top + h + 10)
    pdf.set_text_shaping(use_shaping_engine=True, direction="rtl" if pdf.rtl else "ltr")


def _label(pdf: CarpentryPdf, x: float, y: float, text: str) -> None:
    pdf.set_xy(x, y)
    pdf.cell(0, 3, text)
