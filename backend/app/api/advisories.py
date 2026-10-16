"""POST /api/advisories: research-backed guidance on a design (ADR-018). The client calls it after
each change, debounced. Read-only: the design is validated and analysed, never stored."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.advice.rules import advisories
from app.domain.catalog import load_catalog
from app.domain.errors import DomainError
from app.domain.schema import parse_design
from app.domain.validation import validate_canonical

router = APIRouter(prefix="/api")


class AdvisoriesRequest(BaseModel):
    design: dict


def _invalid(error: DomainError) -> JSONResponse:
    # Engine-owned code, path and message only: nothing from the request is echoed back.
    return JSONResponse(
        status_code=422,
        content={"success": False, "data": None, "error": {"code": error.code, "message": error.message, "path": error.path}},
    )


@router.post("/advisories")
def post_advisories(body: AdvisoriesRequest):
    catalog = load_catalog()
    try:
        design = parse_design(body.design)
    except DomainError as error:
        return _invalid(error)
    issues = validate_canonical(design, catalog)
    if issues:
        return _invalid(issues[0])
    return {"success": True, "data": {"advisories": advisories(design, catalog)}}
