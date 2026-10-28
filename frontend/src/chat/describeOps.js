// Plain-language list of what a proposal's ops will do. Text only; ops are untrusted data.
// Lengths follow the display unit the customer chose (cm or in); the ops themselves stay in mm.
import { compactLength, DEFAULT_UNIT, isUnit } from '../ui/units.js';

const label = (id) => String(id ?? '').replace(/^[a-z]+_/, '').replace(/[_-]/g, ' ');
const words = (catalogId) => String(catalogId ?? '').replace(/_/g, ' ');
const lengthIn = (unitName, unit) => (mm) => `${compactLength(Number(mm) || 0, unit)} ${unitName}`;

const DESCRIBE = {
  create_wardrobe: (o, len) => ['New wardrobe', `${len(o.width)} × ${len(o.height)} × ${len(o.depth)}, ${o.compartmentCount} compartments. Replaces the whole design`],
  update_dimensions: (o, len) => ['Dimensions', ['width', 'height', 'depth'].filter((k) => o[k] != null).map((k) => `${k} ${len(o[k])}`).join(', ')],
  configure_doors: (o) => ['Doors', o.type === 'none' ? 'No doors' : `${o.type}${o.count ? `, ${o.count} doors` : ''}`],
  add_compartment: (o, len) => ['Add compartment', `${len(o.width)} wide at position ${o.position + 1}`],
  modify_compartment: (o, len) => ['Resize compartment', `${label(o.compartmentId)} to ${len(o.width)}`],
  add_partition: (o, len) => ['Add partition', `in ${label(o.compartmentId)}, ${len(o.offset)} from the left`],
  modify_partition: (o) => ['Change partition', label(o.partitionId)],
  add_shelf: (o, len) => ['Add shelf', `in ${label(o.compartmentId)} at ${len(o.y)}`],
  modify_shelf: (o, len) => ['Move shelf', `${label(o.id)}${o.y != null ? ` to ${len(o.y)}` : ''}`],
  add_drawer: (o, len) => ['Add drawer', `in ${label(o.compartmentId)} at ${len(o.y)}, ${len(o.height)} high`],
  modify_drawer: (o) => ['Change drawer', label(o.id)],
  add_rail: (o, len) => ['Add hanging rail', `in ${label(o.compartmentId)} at ${len(o.y)}`],
  modify_rail: (o, len) => ['Move hanging rail', `${label(o.id)} to ${len(o.y)}`],
  set_material: (o) => ['Material', [o.material, o.color, o.finish].filter(Boolean).map((r) => r.catalogId ?? r.name).join(', ') || (o.clear ? 'Reset' : '')],
  set_handles: (o) => ['Handles', [o.style, o.finish].filter(Boolean).map((id) => (id === 'none' ? 'no handles' : words(id))).join(', ')],
  modify_door: (o) => ['Door front', `${label(o.id)}: ${o.front === 'mirror' ? 'mirror' : 'plain panel'}`],
  remove_component: (o) => ['Remove', label(o.id)],
};

// Default compartment names and component types in Hebrew; any other id keeps its own short name.
const HE_SIDE = { left: 'שמאלי', middle: 'אמצעי', right: 'ימני' };
const HE_SIDE_DOOR = { left: 'שמאלית', middle: 'אמצעית', right: 'ימנית' }; // "door" is feminine in Hebrew
const HE_NOUN = { cmp: 'תא', prt: 'מחיצה', shf: 'מדף', drw: 'מגירה', rail: 'מוט', dr: 'דלת' };
function heLabel(id) {
  const [prefix, ...rest] = String(id ?? '').split('_');
  const name = rest.join(' ');
  const noun = HE_NOUN[prefix];
  if (!noun) return label(id);
  if (prefix === 'cmp' && HE_SIDE[name]) return `${noun} ${HE_SIDE[name]}`;
  if (prefix === 'dr' && HE_SIDE_DOOR[name]) return `${noun} ${HE_SIDE_DOOR[name]}`;
  return name ? `${noun} ${name}` : noun;
}
const inHe = (id) => `ב${heLabel(id)}`;

const HE_DIMENSION = { width: 'רוחב', height: 'גובה', depth: 'עומק' };
const HE_DOOR_TYPE = { hinged: 'צירים', sliding: 'הזזה' };
const HE_HANDLE = {
  bar: 'מוט', long_bar: 'מוט ארוך', knob: 'כפתור', edge_pull: 'שקע בקצה', none: 'ללא ידיות',
  black: 'שחור', brushed_steel: 'פלדה מוברשת', brass: 'פליז',
};

const DESCRIBE_HE = {
  create_wardrobe: (o, len) => ['ארון חדש', `${len(o.width)} × ${len(o.height)} × ${len(o.depth)}, ${o.compartmentCount} תאים. מחליף את כל העיצוב`],
  update_dimensions: (o, len) => ['מידות', ['width', 'height', 'depth'].filter((k) => o[k] != null).map((k) => `${HE_DIMENSION[k]} ${len(o[k])}`).join(', ')],
  configure_doors: (o) => ['דלתות', o.type === 'none' ? 'ללא דלתות' : `${HE_DOOR_TYPE[o.type] ?? o.type}${o.count ? `, ${o.count} דלתות` : ''}`],
  add_compartment: (o, len) => ['הוספת תא', `ברוחב ${len(o.width)} במקום ${o.position + 1}`],
  modify_compartment: (o, len) => ['שינוי גודל תא', `${heLabel(o.compartmentId)} ל-${len(o.width)}`],
  add_partition: (o, len) => ['הוספת מחיצה', `${inHe(o.compartmentId)}, ${len(o.offset)} מהשמאל`],
  modify_partition: (o) => ['שינוי מחיצה', heLabel(o.partitionId)],
  add_shelf: (o, len) => ['הוספת מדף', `${inHe(o.compartmentId)} בגובה ${len(o.y)}`],
  modify_shelf: (o, len) => ['הזזת מדף', `${heLabel(o.id)}${o.y != null ? ` ל-${len(o.y)}` : ''}`],
  add_drawer: (o, len) => ['הוספת מגירה', `${inHe(o.compartmentId)} בגובה ${len(o.y)}, גובה המגירה ${len(o.height)}`],
  modify_drawer: (o) => ['שינוי מגירה', heLabel(o.id)],
  add_rail: (o, len) => ['הוספת מוט תלייה', `${inHe(o.compartmentId)} בגובה ${len(o.y)}`],
  modify_rail: (o, len) => ['הזזת מוט תלייה', `${heLabel(o.id)} ל-${len(o.y)}`],
  set_material: (o) => ['חומר', [o.material, o.color, o.finish].filter(Boolean).map((r) => r.catalogId ?? r.name).join(', ') || (o.clear ? 'איפוס' : '')],
  set_handles: (o) => ['ידיות', [o.style, o.finish].filter(Boolean).map((id) => HE_HANDLE[id] ?? words(id)).join(', ')],
  modify_door: (o) => ['חזית דלת', `${heLabel(o.id)}: ${o.front === 'mirror' ? 'מראה' : 'חזית רגילה'}`],
  remove_component: (o) => ['הסרה', heLabel(o.id)],
};

const TABLES = { en: DESCRIBE, he: DESCRIBE_HE };
const UNIT_NAMES = { en: { cm: 'cm', in: 'in' }, he: { cm: 'ס״מ', in: 'אינץ׳' } };

export function describeOps(ops, language = 'en', unit = DEFAULT_UNIT) {
  const table = TABLES[language] ?? DESCRIBE;
  const safeUnit = isUnit(unit) ? unit : DEFAULT_UNIT;
  const len = lengthIn((UNIT_NAMES[language] ?? UNIT_NAMES.en)[safeUnit], safeUnit);
  return ops.map((op) => {
    const [title, detail] = (table[op.op] ?? (() => [language === 'he' ? 'שינוי' : 'Change', String(op.op)]))(op, len);
    return { title, detail };
  });
}
