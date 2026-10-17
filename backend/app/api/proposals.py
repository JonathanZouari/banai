"""POST /api/proposals/apply: verify a signed proposal and apply it to the committed design.

Order matters: signature first (cheap, rejects forgeries before any parsing), then the stale check
(revision and hash of the design the client says is committed), then a full re-validation by the
authoritative engine. Nothing is stored; the client commits the returned design."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from app.api.envelope import fail, ok
from app.agent.language import Language
from app.api.limits import limiter
from app.api.messages import localized
from app.config import Settings, get_settings
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.errors import DomainError
from app.domain.ops import MAX_OPS
from app.services.signing import SigningUnavailable, design_hash, verify_proposal

router = APIRouter(prefix="/api")

HEX64 = r"^[0-9a-f]{64}$"


class SignedProposal(BaseModel):
    model_config = ConfigDict(extra="ignore")  # id / summary / changes are display-only
    baseRevision: Annotated[int, Field(ge=1, le=1_000_000_000, strict=True)]
    baseHash: Annotated[str, Field(pattern=HEX64)]
    ops: Annotated[list[dict[str, Any]], Field(max_length=MAX_OPS)]
    signature: Annotated[str, Field(pattern=HEX64)]


class ApplyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    design: dict[str, Any]
    revision: Annotated[int, Field(ge=1, le=1_000_000_000, strict=True)]
    proposal: SignedProposal
    language: Language = "en"  # localizes the error texts only


@router.post("/proposals/apply")
@limiter.limit(lambda: get_settings().chat_rate_limit)
def apply_proposal(
    request: Request,  # noqa: ARG001 - required by the rate limiter
    body: ApplyRequest,
    settings: Annotated[Settings, Depends(get_settings)],
):
    proposal = body.proposal
    try:
        genuine = verify_proposal(
            proposal.ops, proposal.baseRevision, proposal.baseHash, proposal.signature, settings.proposal_signing_key
        )
    except SigningUnavailable:
        return localized(503, "AGENT_UNAVAILABLE", body.language)
    if not genuine:
        return localized(403, "INVALID_SIGNATURE", body.language)

    stale = localized(409, "STALE", body.language)
    if body.revision != proposal.baseRevision:
        return stale
    catalog = load_catalog()
    try:
        committed = apply_ops(body.design, [], catalog)
    except DomainError as error:
        return fail(422, error.code, error.message, {"path": error.path})
    if design_hash(committed) != proposal.baseHash:
        return stale

    try:
        new_design = apply_ops(committed, proposal.ops, catalog)
    except DomainError as error:
        return fail(422, error.code, error.message, {"path": error.path})
    return ok({"design": new_design, "revision": body.revision + 1})
