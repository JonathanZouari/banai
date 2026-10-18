// Common Israeli practice for wardrobe carpentry, as rules of thumb for the cabinetmaker sheet.
// ASSUMPTION: these come from accepted practice and hardware-maker planning guides (Blum,
// Hettich, Grass/Hafele), System 32, Neufert and Panero. They are NOT the text of any official
// standard (ת"י 1142 and the others are referenced, not reproduced), and the sheet says so.
// All values are millimetres.

export const STANDARDS = Object.freeze({
  panelThickness: { min: 17, max: 18, source: 'מקובל בנגרות (סנדוויץ׳ / MDF / סיבית)' },
  longShelf: { span: 800, minThickness: 24, maxThickness: 28, source: 'כלל אצבע למניעת שקיעה' },
  hingedDepth: { min: 580, max: 600, source: 'מקובל לארון פתיחה (נטו, ללא דלתות)' },
  slidingDepth: { min: 650, max: 700, track: [80, 100], source: 'מקובל לארון הזזה (ברוטו, כולל מסילות)' },
  shortHanging: { min: 950, max: 1100, source: 'Panero, Human Dimension & Interior Space' },
  longHanging: { min: 1500, max: 1650, source: 'Panero / Neufert, Architects\' Data' },
  shelfSpacing: { min: 300, max: 380, source: 'מקובל; חורים מתכווננים לפי System 32' },
  plinth: { min: 70, max: 100, source: 'מקובל בישראל (הגנה ממים ומחיכוך דלת ברצפה)' },
  system32: { setback: 37, pitch: 32, source: 'System 32' },
  edgeBand: { thickness: 1.3, types: 'PVC / ABS', source: 'הספר הכחול, פרק נגרות' },
  wallAnchor: { aboveHeight: 1800, source: 'יציבות רהיטי אחסון – ראו ת"י 1142' },
  // Hinges per hinged door, by door height (hardware-maker planning guides; verify per hinge model).
  hinges: [[900, 2], [1600, 3], [2000, 4], [Infinity, 5]],
  // Drawer runner length: the largest 50 mm step that leaves 50 mm behind the runner.
  runnerStep: 50,
  runnerClearance: 50,
  backPanel: { min: 3, max: 6, material: 'HDF' },
});

export const SOURCES = Object.freeze([
  'קטלוגים וחוברות תכנון של יצרני פרזול: Blum, Hettich – The Book, Grass, Hafele',
  'שיטת הנגרות המודולרית System 32 (מרווח 32 מ"מ, 37 מ"מ מהקצה הקדמי)',
  'Ernst Neufert, Architects\' Data; Julius Panero, Human Dimension & Interior Space',
  'מכון התקנים הישראלי: ת"י 1142 (רהיטי אחסון – חוזק, יציבות ובטיחות)',
  'המפרט הכללי לעבודות בנייה ("הספר הכחול"), פרק נגרות',
]);

export const DISCLAIMER = 'מסמך זה הוא הנחיה בלבד, לפי כללי אצבע מקובלים בנגרות בישראל. '
  + 'הוא אינו שרטוט ייצור מאושר ואינו מאשר עמידה בתקן כלשהו (כולל ת"י 1142). '
  + 'על הנגר לאמת את כל המידות באתר, לבחור חומרים ופרזול לפי קטלוג היצרן, ולוודא חוזק, יציבות ועיגון לקיר.';

/** Hinges for a hinged door of the given height (mm). */
export const hingesFor = (doorHeight) => STANDARDS.hinges.find(([upTo]) => doorHeight <= upTo)[1];

/** Drawer runner length (mm) for an inner depth, or 0 when no standard step fits. */
export function runnerLength(innerDepth) {
  const { runnerStep, runnerClearance } = STANDARDS;
  return Math.max(0, Math.floor((innerDepth - runnerClearance) / runnerStep) * runnerStep);
}
