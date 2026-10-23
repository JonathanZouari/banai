// The private link of a saved design: /#d=<uuid>.<token>. The fragment never reaches a server log or
// a Referer header; only this page reads it and sends the token to the API as a bearer credential.
const LINK = /^#d=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

/** { designId, token } from a location hash, or null when it is not a design link. */
export function parseShareHash(hash) {
  const match = LINK.exec(hash ?? '');
  return match ? { designId: match[1], token: match[2] } : null;
}

export const shareHash = ({ designId, token }) => `#d=${designId}.${token}`;

// Accounts PROTOTYPE: /#my=<uuid> reopens one of the signed-in user's designs. It holds no secret:
// the server only answers it for the design's owner.
const MY_LINK = /^#my=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** { designId } from a location hash, or null when it is not an account design link. */
export function parseMyHash(hash) {
  const match = MY_LINK.exec(hash ?? '');
  return match ? { designId: match[1] } : null;
}

export const myHash = ({ designId }) => `#my=${designId}`;
