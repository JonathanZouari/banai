"""Proposal signing (HMAC-SHA256). The server stores nothing: a proposal is only applied
when its signature verifies, it was made against the same revision, and the design the
client sends back hashes to the same value it was proposed against."""

from __future__ import annotations

import hashlib
import hmac
import json


def canonical_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def design_hash(design: dict) -> str:
    """Hash of a canonical (already parsed) design."""
    return hashlib.sha256(canonical_json(design)).hexdigest()


def _payload(proposal_id: str, ops: list, base_revision: int, base_hash: str) -> bytes:
    return canonical_json({"proposalId": proposal_id, "ops": ops, "baseRevision": base_revision, "baseHash": base_hash})


def sign(key: bytes, *, proposal_id: str, ops: list, base_revision: int, base_hash: str) -> str:
    return hmac.new(key, _payload(proposal_id, ops, base_revision, base_hash), hashlib.sha256).hexdigest()


def verify(key: bytes, signature: str, *, proposal_id: str, ops: list, base_revision: int, base_hash: str) -> bool:
    expected = sign(key, proposal_id=proposal_id, ops=ops, base_revision=base_revision, base_hash=base_hash)
    return hmac.compare_digest(expected, signature)


def sign_reply(key: bytes, text: str) -> str:
    """Signs an agent reply, so text-to-speech only reads aloud what the agent said (not any text)."""
    return hmac.new(key, b"reply:" + text.encode(), hashlib.sha256).hexdigest()


def verify_reply(key: bytes, signature: str, text: str) -> bool:
    return hmac.compare_digest(sign_reply(key, text), signature)
