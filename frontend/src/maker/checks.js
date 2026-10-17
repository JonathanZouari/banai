// Checks a design against common practice (standards.js). Pure. Each finding is advice for the
// customer and the cabinetmaker: 'warn' should be looked at, 'info' is a recommendation, 'ok'
// confirms a rule that was checked. Nothing here says the design is approved or manufacturable.
import { interiorHeight } from '../domain/geometry.js';
import { STANDARDS } from './standards.js';

const cm = (mm) => (mm / 10).toFixed(1);
const range = ({ min, max }) => `${cm(min)}–${cm(max)} ס"מ`;

function finding(level, text, source) {
  return { level, text, source };
}

function depthCheck(design) {
  const { depth } = design.dimensions;
  const { type } = design.doors;
  if (type === 'sliding') {
    const rule = STANDARDS.slidingDepth;
    return depth < rule.min
      ? finding('warn', `עומק ${cm(depth)} ס"מ קטן מהמקובל לארון הזזה (${range(rule)} ברוטו; המסילות דורשות ${rule.track[0] / 10}–${rule.track[1] / 10} ס"מ).`, rule.source)
      : finding('ok', `עומק ${cm(depth)} ס"מ מתאים לארון הזזה.`, rule.source);
  }
  const rule = STANDARDS.hingedDepth;
  if (depth < rule.min) return finding('warn', `עומק ${cm(depth)} ס"מ קטן מהמקובל לארון בגדים (${range(rule)} נטו).`, rule.source);
  if (depth > rule.max + 50) return finding('info', `עומק ${cm(depth)} ס"מ גדול מהמקובל (${range(rule)} נטו). אפשרי, אך בדקו גישה לחלק האחורי.`, rule.source);
  return finding('ok', `עומק ${cm(depth)} ס"מ מתאים לארון פתיחה (עם הדלתות כ-${cm(depth + 20)} ס"מ).`, rule.source);
}

function thicknessChecks(design) {
  const rule = STANDARDS.panelThickness;
  const out = [];
  const panel = design.carcass.panelThickness;
  if (panel < rule.min || panel > rule.max) out.push(finding('warn', `עובי דפנות ${panel} מ"מ שונה מהמקובל (${rule.min}–${rule.max} מ"מ).`, rule.source));
  const odd = design.partitions.filter((p) => p.thickness < rule.min || p.thickness > rule.max).length;
  if (odd) out.push(finding('warn', `${odd} מחיצות בעובי שונה מהמקובל (${rule.min}–${rule.max} מ"מ).`, rule.source));
  if (!out.length) out.push(finding('ok', `עובי דפנות ומחיצות ${panel} מ"מ – מקובל.`, rule.source));
  return out;
}

function shelfChecks(design) {
  const rule = STANDARDS.longShelf;
  const spacing = STANDARDS.shelfSpacing;
  const out = [];
  design.compartments.forEach((compartment, index) => {
    const name = `תא ${index + 1}`;
    const thin = compartment.shelves.filter((s) => s.thickness < rule.minThickness);
    if (compartment.width > rule.span && thin.length) {
      out.push(finding('warn', `${name}: ${thin.length} מדפים ברוחב ${cm(compartment.width)} ס"מ – מעל ${cm(rule.span)} ס"מ מומלץ עובי ${rule.minThickness}–${rule.maxThickness} מ"מ או תמיכה מרכזית, למניעת שקיעה.`, rule.source));
    }
    // One finding per compartment. Gaps a few centimetres over the range are normal, so only
    // clearly large ones (TOLERANCE) are mentioned; tight ones always are.
    const TOLERANCE = 50;
    const shelves = [...compartment.shelves].sort((a, b) => a.y - b.y);
    const gaps = shelves.slice(1).map((shelf, i) => ({ shelf, below: shelves[i], gap: shelf.y - (shelves[i].y + shelves[i].thickness) }));
    const tight = gaps.filter(({ gap }) => gap < spacing.min).map(({ gap }) => cm(gap));
    const wide = gaps
      .filter(({ gap, shelf, below }) => gap > spacing.max + TOLERANCE && !compartment.rails.some((r) => r.y > below.y && r.y < shelf.y))
      .map(({ gap }) => cm(gap));
    if (tight.length) out.push(finding('warn', `${name}: מרווח ${tight.join(', ')} ס"מ בין מדפים – צפוף מהמקובל (${range(spacing)}).`, spacing.source));
    if (wide.length) out.push(finding('info', `${name}: מרווח ${wide.join(', ')} ס"מ בין מדפים – אפשר להוסיף מדף (מקובל ${range(spacing)}).`, spacing.source));
  });
  return out;
}

/** Free drop under each rail, to the nearest shelf/drawer top below it (or the base). */
function railChecks(design) {
  const shortRule = STANDARDS.shortHanging;
  const longRule = STANDARDS.longHanging;
  const out = [];
  design.compartments.forEach((compartment, index) => {
    const tops = [...compartment.shelves.map((s) => s.y + s.thickness), ...compartment.drawers.map((d) => d.y + d.height)];
    compartment.rails.forEach((rail) => {
      const floor = Math.max(0, ...tops.filter((top) => top <= rail.y));
      const drop = rail.y - floor;
      const name = `תא ${index + 1}`;
      if (drop >= longRule.min) out.push(finding('ok', `${name}: תלייה ארוכה – ${cm(drop)} ס"מ מתחת למוט (מקובל ${range(longRule)}).`, longRule.source));
      else if (drop >= shortRule.min) out.push(finding('ok', `${name}: תלייה קצרה – ${cm(drop)} ס"מ מתחת למוט (מקובל ${range(shortRule)}).`, shortRule.source));
      else out.push(finding('warn', `${name}: רק ${cm(drop)} ס"מ מתחת למוט – פחות מתלייה קצרה מקובלת (${range(shortRule)}).`, shortRule.source));
    });
  });
  return out;
}

/** All findings, warnings first. */
export function checkDesign(design) {
  const plinth = STANDARDS.plinth;
  const anchor = STANDARDS.wallAnchor;
  const findings = [
    depthCheck(design),
    ...thicknessChecks(design),
    ...shelfChecks(design),
    ...railChecks(design),
    finding('info', `מומלץ צוקל (בסיס) בגובה ${range(plinth)} – הגבהה ממים ומניעת חיכוך הדלת ברצפה. הצוקל אינו חלק מהמודל; יש להוסיפו לגובה הכולל או להפחית מגובה הגוף.`, plinth.source),
  ];
  if (design.dimensions.height > anchor.aboveHeight) {
    findings.push(finding('warn', `ארון בגובה ${cm(design.dimensions.height)} ס"מ – יש לעגן לקיר.`, anchor.source));
  }
  if (interiorHeight(design) <= 0) findings.push(finding('warn', 'גובה פנימי לא תקין.', ''));
  const order = { warn: 0, info: 1, ok: 2 };
  return findings.sort((a, b) => order[a.level] - order[b.level]);
}
