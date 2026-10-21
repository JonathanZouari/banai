// Minimal right-to-left display ordering for one line of Hebrew text with numbers and Latin codes.
// jsPDF draws characters in the order given, so a Hebrew line is converted to visual order here and
// drawn right-aligned. Simplified from the Unicode bidirectional algorithm: enough for letters,
// digits (kept left-to-right as numbers), codes like "C1" or "D3.1", and brackets.

const MIRROR = Object.freeze({ '(': ')', ')': '(', '[': ']', ']': '[', '<': '>', '>': '<' });
const kind = (char) => {
  if (/[֐-׿]/.test(char)) return 'R';
  if (/[A-Za-z]/.test(char)) return 'L';
  if (/[0-9]/.test(char)) return 'EN';
  return 'N';
};

export function toVisual(text) {
  const chars = Array.from(String(text ?? ''));
  if (!chars.some((c) => kind(c) === 'R')) return chars.join(''); // no Hebrew: nothing to reorder
  // 1. group consecutive characters of the same kind
  let runs = [];
  chars.forEach((char) => {
    const k = kind(char);
    const last = runs.at(-1);
    if (last && last.kind === k) last.text += char;
    else runs.push({ kind: k, text: char });
  });
  // 2. a single "." "," ":" "/" between two numbers belongs to the number (3.1, 12:30)
  runs.forEach((run, i) => {
    if (run.kind === 'N' && run.text.length === 1 && '.,:/'.includes(run.text) && runs[i - 1]?.kind === 'EN' && runs[i + 1]?.kind === 'EN') run.kind = 'EN';
  });
  // 3. letters and numbers directly next to each other form one left-to-right run ("D3.1")
  const merged = [];
  runs.forEach((run) => {
    const ltr = run.kind === 'L' || run.kind === 'EN';
    const last = merged.at(-1);
    if (ltr && last?.ltr) last.text += run.text;
    else merged.push({ ltr, kind: run.kind, text: run.text });
  });
  runs = merged;
  // 4. neutrals take the left-to-right direction only between two Latin runs; otherwise right-to-left
  runs.forEach((run, i) => {
    if (run.kind !== 'N') return;
    const before = runs[i - 1];
    const after = runs[i + 1];
    run.ltr = Boolean(before?.ltr && after?.ltr && before.kind === 'L' && after.kind === 'L');
  });
  // 5. visual order: runs reversed; right-to-left runs also reverse their characters (brackets mirrored)
  return runs
    .slice()
    .reverse()
    .map((run) => (run.ltr ? run.text : Array.from(run.text).reverse().map((c) => MIRROR[c] ?? c).join('')))
    .join('');
}
