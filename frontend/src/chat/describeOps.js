// Plain-language list of what a proposal's ops will do. Text only; ops are untrusted data.
const cm = (mm, unit = 'cm') => `${Math.round(mm) / 10} ${unit}`;
const label = (id) => String(id ?? '').replace(/^[a-z]+_/, '').replace(/[_-]/g, ' ');

const DESCRIBE = {
  create_wardrobe: (o) => ['New wardrobe', `${cm(o.width)} × ${cm(o.height)} × ${cm(o.depth)}, ${o.compartmentCount} compartments`],
  update_dimensions: (o) => ['Dimensions', ['width', 'height', 'depth'].filter((k) => o[k] != null).map((k) => `${k} ${cm(o[k])}`).join(', ')],
  configure_doors: (o) => ['Doors', o.type === 'none' ? 'No doors' : `${o.type}${o.count ? `, ${o.count} doors` : ''}`],
  add_compartment: (o) => ['Add compartment', `${cm(o.width)} wide at position ${o.position + 1}`],
  modify_compartment: (o) => ['Resize compartment', `${label(o.compartmentId)} to ${cm(o.width)}`],
  add_partition: (o) => ['Add partition', `in ${label(o.compartmentId)}, ${cm(o.offset)} from the left`],
  modify_partition: (o) => ['Change partition', label(o.partitionId)],
  add_shelf: (o) => ['Add shelf', `in ${label(o.compartmentId)} at ${cm(o.y)}`],
  modify_shelf: (o) => ['Move shelf', `${label(o.id)}${o.y != null ? ` to ${cm(o.y)}` : ''}`],
  add_drawer: (o) => ['Add drawer', `in ${label(o.compartmentId)} at ${cm(o.y)}, ${cm(o.height)} high`],
  modify_drawer: (o) => ['Change drawer', label(o.id)],
  add_rail: (o) => ['Add hanging rail', `in ${label(o.compartmentId)} at ${cm(o.y)}`],
  modify_rail: (o) => ['Move hanging rail', `${label(o.id)} to ${cm(o.y)}`],
  set_material: (o) => ['Material', [o.material, o.color, o.finish].filter(Boolean).map((r) => r.catalogId ?? r.name).join(', ') || (o.clear ? 'Reset' : '')],
  remove_component: (o) => ['Remove', label(o.id)],
};

const HE_DIMENSION = { width: 'רוחב', height: 'גובה', depth: 'עומק' };
const HE_UNIT = 'ס״מ';
const hcm = (mm) => cm(mm, HE_UNIT);

const DESCRIBE_HE = {
  create_wardrobe: (o) => ['ארון חדש', `${hcm(o.width)} × ${hcm(o.height)} × ${hcm(o.depth)}, ${o.compartmentCount} תאים`],
  update_dimensions: (o) => ['מידות', ['width', 'height', 'depth'].filter((k) => o[k] != null).map((k) => `${HE_DIMENSION[k]} ${hcm(o[k])}`).join(', ')],
  configure_doors: (o) => ['דלתות', o.type === 'none' ? 'ללא דלתות' : `${o.type}${o.count ? `, ${o.count} דלתות` : ''}`],
  add_compartment: (o) => ['הוספת תא', `ברוחב ${hcm(o.width)} במקום ${o.position + 1}`],
  modify_compartment: (o) => ['שינוי גודל תא', `${label(o.compartmentId)} ל-${hcm(o.width)}`],
  add_partition: (o) => ['הוספת מחיצה', `ב-${label(o.compartmentId)}, ${hcm(o.offset)} מהשמאל`],
  modify_partition: (o) => ['שינוי מחיצה', label(o.partitionId)],
  add_shelf: (o) => ['הוספת מדף', `ב-${label(o.compartmentId)} בגובה ${hcm(o.y)}`],
  modify_shelf: (o) => ['הזזת מדף', `${label(o.id)}${o.y != null ? ` ל-${hcm(o.y)}` : ''}`],
  add_drawer: (o) => ['הוספת מגירה', `ב-${label(o.compartmentId)} בגובה ${hcm(o.y)}, גובה המגירה ${hcm(o.height)}`],
  modify_drawer: (o) => ['שינוי מגירה', label(o.id)],
  add_rail: (o) => ['הוספת מוט תלייה', `ב-${label(o.compartmentId)} בגובה ${hcm(o.y)}`],
  modify_rail: (o) => ['הזזת מוט תלייה', `${label(o.id)} ל-${hcm(o.y)}`],
  set_material: (o) => ['חומר', [o.material, o.color, o.finish].filter(Boolean).map((r) => r.catalogId ?? r.name).join(', ') || (o.clear ? 'איפוס' : '')],
  remove_component: (o) => ['הסרה', label(o.id)],
};

const TABLES = { en: DESCRIBE, he: DESCRIBE_HE };

export function describeOps(ops, language = 'en') {
  const table = TABLES[language] ?? DESCRIBE;
  return ops.map((op) => {
    const [title, detail] = (table[op.op] ?? (() => [language === 'he' ? 'שינוי' : 'Change', String(op.op)]))(op);
    return { title, detail };
  });
}
