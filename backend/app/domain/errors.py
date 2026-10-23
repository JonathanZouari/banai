"""Domain error type shared by validation and operations.

Error codes and paths are part of the cross-language contract: the JS engine
(frontend/src/domain/errors.js) must produce the same code and path for the
same input (verified by shared/fixtures/ops).
"""

from __future__ import annotations

SCHEMA_INVALID = "SCHEMA_INVALID"
WIDTH_MISMATCH = "WIDTH_MISMATCH"
OUT_OF_RANGE = "OUT_OF_RANGE"
OUT_OF_BOUNDS = "OUT_OF_BOUNDS"
OVERLAP = "OVERLAP"
DUPLICATE_ID = "DUPLICATE_ID"
DOOR_INVALID = "DOOR_INVALID"
INSERT_INVALID = "INSERT_INVALID"
UNKNOWN_CATALOG_ID = "UNKNOWN_CATALOG_ID"
NOT_FOUND = "NOT_FOUND"
INVALID_OP = "INVALID_OP"


class DomainError(Exception):
    def __init__(self, code: str, path: str, message: str) -> None:
        super().__init__(code, path, message)  # keeps the error picklable
        self.code = code
        self.path = path
        self.message = message

    def __str__(self) -> str:
        return f"{self.code} at {self.path}: {self.message}"

    def to_dict(self) -> dict:
        return {"code": self.code, "path": self.path, "message": self.message}

    def __eq__(self, other: object) -> bool:
        return isinstance(other, DomainError) and self.to_dict() == other.to_dict()

    def __hash__(self) -> int:
        return hash((self.code, self.path, self.message))

    def __repr__(self) -> str:
        return f"DomainError({self.code!r}, {self.path!r}, {self.message!r})"
