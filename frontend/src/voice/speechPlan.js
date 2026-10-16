// Splits a reply into short pieces to be spoken. The pieces are requested in parallel and played in
// order, because OpenAI's speech generation is only about 1 to 2.5 times faster than real time: one
// long request cannot keep up with its own playback and stutters, while several short ones finish
// well before they are needed. The first piece is short, so sound starts early.
export const SPEECH_LIMITS = Object.freeze({
  firstMax: 60, // characters in the first piece (starts sound early)
  restMax: 220, // characters in each later piece
  totalMax: 900, // characters spoken per reply (a cost guard, not a business rule)
  charsPerSecond: 14, // rough speaking rate, used to size the start buffer
});

const SENTENCE_BREAK = /(?<=[.!?…])\s+/u;

function clip(text, limit) {
  if (text.length <= limit) return [text, ''];
  const window = text.slice(0, limit);
  const space = window.lastIndexOf(' ');
  const cut = space >= limit / 3 ? space : limit;
  return [text.slice(0, cut).trim(), text.slice(cut).trim()];
}

/** Whole sentences up to `limit` characters, cut at the last sentence end (else the last space). */
function capTotal(text, limit) {
  if (text.length <= limit) return text;
  const window = text.slice(0, limit);
  const ends = [...window.matchAll(/[.!?…](?=\s|$)/gu)].map((m) => m.index + 1);
  if (ends.length && ends.at(-1) >= limit / 3) return window.slice(0, ends.at(-1)).trim();
  return clip(text, limit)[0];
}

export function planSpeech(rawText, limits = SPEECH_LIMITS) {
  const text = capTotal(String(rawText ?? '').replace(/\s+/g, ' ').trim(), limits.totalMax);
  if (!text) return [];
  const sentences = text.split(SENTENCE_BREAK).filter(Boolean);
  const pieces = [];

  // First piece: the first sentence, or its first clause when it is long.
  let first = sentences.shift();
  // A first sentence only a little longer than firstMax stays whole: a tiny second piece would cost a request for nothing.
  if (first.length > limits.firstMax + 30) {
    const window = first.slice(0, limits.firstMax);
    const comma = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(': '));
    const space = window.lastIndexOf(' ');
    const cut = comma >= 20 ? comma + 1 : space >= 20 ? space : limits.firstMax;
    sentences.unshift(first.slice(cut).trim());
    first = first.slice(0, cut).trim();
  }
  pieces.push(first);

  // The rest: sentences merged up to restMax; one very long sentence is split at spaces.
  let current = '';
  const flush = () => { if (current) pieces.push(current); current = ''; };
  for (let sentence of sentences) {
    if (!sentence) continue;
    while (sentence.length > limits.restMax) {
      flush();
      const [head, tail] = clip(sentence, limits.restMax);
      pieces.push(head);
      sentence = tail;
    }
    if (current && current.length + 1 + sentence.length > limits.restMax) flush();
    current = current ? `${current} ${sentence}` : sentence;
  }
  flush();
  return pieces.filter(Boolean);
}

/** About how long a piece takes to say, in seconds. */
export const estimateSeconds = (text, limits = SPEECH_LIMITS) => text.length / limits.charsPerSecond;
