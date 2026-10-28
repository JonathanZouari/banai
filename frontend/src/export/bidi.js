// Visual ordering of short right-to-left (Hebrew) labels for the PDF.
// jsPDF draws strictly left to right, and its built-in bidi engine follows the Unicode algorithm, which
// scrambles runs like "78.74 in × 94.49 in" inside Hebrew text. Labels here are short, so we use a simpler
// rule that suits them: a number or Latin word stays together with the neutral characters between
// it and the next one (spaces, ×, –, ., :), Hebrew runs are reversed, and runs are laid out right to left.

const HEBREW = /[֐-׿]/;
const LATIN_OR_DIGIT = /[A-Za-z0-9]/;
const MIRROR = Object.freeze({ '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' });

/** True when the text contains Hebrew letters. */
export const hasHebrew = (text) => HEBREW.test(text);

/**
 * `text` (logical order, right-to-left base direction) as the string to draw left to right.
 * Text without Hebrew is returned unchanged.
 */
export function toVisual(text) {
  const input = String(text ?? '');
  if (!hasHebrew(input)) return input;
  const chars = [...input];
  const kinds = chars.map((ch) => (HEBREW.test(ch) ? 'R' : LATIN_OR_DIGIT.test(ch) ? 'L' : 'N'));
  // A neutral between two characters of the same kind joins them; any other neutral follows the base (R).
  let previous = null;
  for (let i = 0; i < kinds.length; i += 1) {
    if (kinds[i] !== 'N') { previous = kinds[i]; continue; }
    let end = i;
    while (end < kinds.length && kinds[end] === 'N') end += 1;
    const next = end < kinds.length ? kinds[end] : null;
    const resolved = previous && previous === next ? previous : 'R';
    for (let j = i; j < end; j += 1) kinds[j] = resolved;
    i = end - 1;
  }
  const runs = [];
  chars.forEach((ch, i) => {
    const last = runs.at(-1);
    if (last && last.kind === kinds[i]) last.chars.push(ch);
    else runs.push({ kind: kinds[i], chars: [ch] });
  });
  return runs.reverse().map((run) => (run.kind === 'R'
    ? run.chars.reverse().map((ch) => MIRROR[ch] ?? ch).join('')
    : run.chars.join(''))).join('');
}
