"""Signed design proposals (ADR-020): the chat agent proposes ops, the server signs them against the
design they were made for, and /api/proposals/apply applies them only to that exact design.

A proposal is {ops, summary, baseRevision, baseHash, signature}. The signature is an HMAC over the
canonical JSON of everything else, so neither the ops nor the base can be edited in the browser. The
hash is over the canonical (parsed) design, so key order and v1/v2 spelling do not matter.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from functools import lru_cache

from app.config import get_settings

MAX_SUMMARY = 300


def canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def design_hash(design: dict) -> str:
    """SHA-256 of a canonical design (the output of parse_design)."""
    return hashlib.sha256(canonical_json(design).encode("utf-8")).hexdigest()


@lru_cache
def _secret() -> bytes:
    """PROPOSAL_SECRET, or a random key for this process (proposals then expire with a restart)."""
    configured = get_settings().proposal_secret
    return configured.encode("utf-8") if configured else secrets.token_bytes(32)


def _payload(proposal: dict) -> bytes:
    unsigned = {key: proposal[key] for key in ("ops", "summary", "baseRevision", "baseHash")}
    return canonical_json(unsigned).encode("utf-8")


def sign(ops: list, summary: str, base_revision: int, base_design: dict, secret: bytes | None = None) -> dict:
    proposal = {"ops": ops, "summary": summary, "baseRevision": base_revision, "baseHash": design_hash(base_design)}
    proposal["signature"] = hmac.new(secret or _secret(), _payload(proposal), hashlib.sha256).hexdigest()
    return proposal


def verify(proposal: dict, secret: bytes | None = None) -> bool:
    """True when the proposal is exactly as this server signed it (constant-time compare)."""
    try:
        expected = hmac.new(secret or _secret(), _payload(proposal), hashlib.sha256).hexdigest()
    except (KeyError, TypeError, ValueError):
        return False
    signature = proposal.get("signature")
    # Bytes, not str: compare_digest raises on a non-ASCII str (a 500 instead of a refusal).
    return isinstance(signature, str) and hmac.compare_digest(expected.encode(), signature.encode("utf-8", "replace"))
