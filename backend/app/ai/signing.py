"""Stateless proposal signing: HMAC-SHA256 over (ops, baseRevision, baseHash)."""

from __future__ import annotations

import hashlib
import hmac
import json


def canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def design_hash(design: dict) -> str:
    return hashlib.sha256(canonical_json(design).encode("utf-8")).hexdigest()


def sign_proposal(key: str, ops: list[dict], base_revision: int, base_hash: str) -> str:
    payload = canonical_json({"ops": ops, "baseRevision": base_revision, "baseHash": base_hash})
    return hmac.new(key.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_proposal(key: str, ops: list[dict], base_revision: int, base_hash: str, signature: str) -> bool:
    expected = sign_proposal(key, ops, base_revision, base_hash)
    return hmac.compare_digest(expected, signature)
