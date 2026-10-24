// The customer's request data that lives next to the design but is not part of it: the revision and
// the ops engine never see it. Notes ("special requests") for the carpenter are free text, so they
// are cleaned like other customer text: no control, zero-width or bidi-override characters (they can
// hide or reorder text), Windows line breaks become a plain newline, and the length is capped.
// Pure; unit-tested.

// ASSUMPTION: a configurable default, not a business rule.
export const MAX_NOTES = 1000;

const LF = 0x0a;
const CR = 0x0d;
// [from, to] code points that are dropped: control characters (except the newline), zero-width
// characters, line/paragraph separators, bidi embeddings/overrides/isolates and the BOM.
const UNSAFE_RANGES = Object.freeze([
  [0x00, 0x09], [0x0b, 0x1f], [0x7f, 0x9f], [0x200b, 0x200d], [0x2028, 0x2029],
  [0x202a, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff],
]);

const isUnsafe = (code) => UNSAFE_RANGES.some(([from, to]) => code >= from && code <= to);

export function cleanNotes(raw) {
  const chars = [...String(raw ?? '')];
  const out = [];
  chars.forEach((char, index) => {
    const code = char.codePointAt(0);
    if (code === CR) {
      // CRLF and a lone CR both become one newline.
      if (chars[index + 1]?.codePointAt(0) !== LF) out.push(String.fromCharCode(LF));
      return;
    }
    if (!isUnsafe(code)) out.push(char);
  });
  return out.join('').slice(0, MAX_NOTES);
}
