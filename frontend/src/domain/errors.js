// Error codes and paths are a cross-language contract with backend/app/domain/errors.py.

export const SCHEMA_INVALID = 'SCHEMA_INVALID';
export const WIDTH_MISMATCH = 'WIDTH_MISMATCH';
export const OUT_OF_RANGE = 'OUT_OF_RANGE';
export const OUT_OF_BOUNDS = 'OUT_OF_BOUNDS';
export const OVERLAP = 'OVERLAP';
export const DUPLICATE_ID = 'DUPLICATE_ID';
export const DOOR_INVALID = 'DOOR_INVALID';
export const INSERT_INVALID = 'INSERT_INVALID';
export const UNKNOWN_CATALOG_ID = 'UNKNOWN_CATALOG_ID';
export const NOT_FOUND = 'NOT_FOUND';
export const INVALID_OP = 'INVALID_OP';

export class DomainError extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = 'DomainError';
    this.code = code;
    this.path = path;
    this.detail = message;
  }

  toJSON() {
    return { code: this.code, path: this.path, message: this.detail };
  }
}
