import pytest

from app.services.signing import SigningUnavailable, canonical_json, design_hash, sign_proposal, verify_proposal

KEY = "k" * 64
OPS = [{"op": "add_shelf", "compartmentId": "cmp_a", "y": 400, "id": "shf_1"}]


def test_canonical_json_ignores_key_order():
    assert canonical_json({"b": 1, "a": [2, {"d": 1, "c": 2}]}) == canonical_json({"a": [2, {"c": 2, "d": 1}], "b": 1})


def test_design_hash_changes_with_the_design():
    assert design_hash({"a": 1}) == design_hash({"a": 1})
    assert design_hash({"a": 1}) != design_hash({"a": 2})


def test_signature_verifies_only_for_the_exact_payload():
    signature = sign_proposal(OPS, 3, "h" * 64, KEY)
    assert verify_proposal(OPS, 3, "h" * 64, signature, KEY)
    assert not verify_proposal(OPS, 4, "h" * 64, signature, KEY)
    assert not verify_proposal(OPS, 3, "x" * 64, signature, KEY)
    assert not verify_proposal([{**OPS[0], "y": 401}], 3, "h" * 64, signature, KEY)
    assert not verify_proposal(OPS, 3, "h" * 64, signature, "other-key")


def test_signing_requires_a_key():
    with pytest.raises(SigningUnavailable):
        sign_proposal(OPS, 1, "h" * 64, "")
