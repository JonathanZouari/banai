"""POST /api/proposals/apply (ADR-020): apply a chat proposal the customer confirmed.

The server checks that it signed the proposal, that it was made for exactly this design (revision and
hash), re-validates, applies and returns the new design with revision + 1. A design that moved on since
the proposal is a 409 STALE: the customer asks again. Nothing is stored.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.agent.proposals import design_hash, verify
from app.api.limits import too_many_nodes
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.errors import DomainError
from app.domain.schema import parse_design
from app.domain.validation import validate_canonical

router = APIRouter(prefix="/api")


class ApplyRequest(BaseModel):
    design: dict
    revision: int = Field(ge=1)
    proposal: dict


def _error(status_code: int, code: str, message: str, path: str | None = None) -> JSONResponse:
    error = {"code": code, "message": message} if path is None else {"code": code, "message": message, "path": path}
    return JSONResponse(status_code=status_code, content={"success": False, "data": None, "error": error})


@router.post("/proposals/apply")
def apply_proposal(body: ApplyRequest):
    if too_many_nodes(body.design) or too_many_nodes(body.proposal):
        return _error(422, "SCHEMA_INVALID", "the design is too large", "design")
    catalog = load_catalog()
    try:
        design = parse_design(body.design)
    except DomainError as error:
        return _error(422, error.code, error.message, error.path)
    issues = validate_canonical(design, catalog)
    if issues:
        return _error(422, issues[0].code, issues[0].message, issues[0].path)
    if not verify(body.proposal):
        return _error(400, "BAD_SIGNATURE", "This proposal was not made by this server, or it was changed.")
    if body.proposal["baseRevision"] != body.revision or body.proposal["baseHash"] != design_hash(design):
        return _error(409, "STALE", "The design changed after this proposal was made. Ask for a new one.")
    try:
        updated = apply_ops(design, body.proposal["ops"], catalog)
    except DomainError as error:  # cannot happen for a proposal signed on this design; kept as a guard
        return _error(422, error.code, error.message, error.path)
    return {"success": True, "data": {"design": updated, "revision": body.revision + 1}}
