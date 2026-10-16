"""Stateless proposal signing: HMAC-SHA256 over (ops, baseRevision, baseHash).

The server stores nothing. A proposal is only applied when its signature verifies and the
design it was made for is still the committed one (same revision and same hash).
"""

from __future__ import annotations

import hashlib
import hmac
import json


class SigningUnavailable(RuntimeError):
    """PROPOSAL_SIGNING_KEY is not configured."""


def canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def design_hash(design: dict) -> str:
    return hashlib.sha256(canonical_json(design).encode("utf-8")).hexdigest()


def _digest(ops: list, base_revision: int, base_hash: str, key: str) -> str:
    if not key:
        raise SigningUnavailable("PROPOSAL_SIGNING_KEY is not set")
    payload = canonical_json({"ops": ops, "baseRevision": base_revision, "baseHash": base_hash})
    return hmac.new(key.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def sign_proposal(ops: list, base_revision: int, base_hash: str, key: str) -> str:
    return _digest(ops, base_revision, base_hash, key)


def verify_proposal(ops: list, base_revision: int, base_hash: str, signature: str, key: str) -> bool:
    return hmac.compare_digest(_digest(ops, base_revision, base_hash, key), signature)
