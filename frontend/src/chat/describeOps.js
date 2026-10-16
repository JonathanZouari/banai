// Plain-language list of what a proposal's ops will do. Text only; ops are untrusted data.
const cm = (mm) => `${Math.round(mm) / 10} cm`;
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

export function describeOps(ops) {
  return ops.map((op) => {
    const [title, detail] = (DESCRIBE[op.op] ?? (() => ['Change', String(op.op)]))(op);
    return { title, detail };
  });
}
