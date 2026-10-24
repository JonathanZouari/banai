// Number expressions ("200 × 240 × 60", "30–600") stay left to right inside Hebrew text, as in the
// carpenter PDF. Without this, the bidi algorithm treats each number as a separate run in an RTL
// line and can show "60 × 240 × 200". The isolate characters are built from code points so no
// invisible character is ever typed into the source.
const LRI = String.fromCharCode(0x2066); // left-to-right isolate
const PDI = String.fromCharCode(0x2069); // pop directional isolate

export const ltr = (text) => `${LRI}${text}${PDI}`;

/** The text without isolates (for comparisons in tests and plain-text uses). */
export const plainText = (text) => String(text).split(LRI).join('').split(PDI).join('');
