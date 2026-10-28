// Start-screen illustrations: one small inline SVG scene per card, drawn in theme colours. They are
// decorative (aria-hidden); the motion lives in components.css and plays while the card is hovered or
// its button has keyboard focus (never under prefers-reduced-motion).
// Shape classes: s = surface, p = primary container, a = accent, l = line. `m` marks a moving part.
const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
  node.append(...children);
  return node;
}

const rect = (x, y, width, height, cls, rx = 2) => svg('rect', { x, y, width, height, rx, class: cls });
const line = (x1, y1, x2, y2, cls = 'l') => svg('line', { x1, y1, x2, y2, class: cls });
const group = (cls, children) => svg('g', { class: cls }, children);
const handle = (x, y) => rect(x, y, 2, 10, 'a', 1);
const hanger = (x, y) => svg('path', { d: `M${x} ${y} v3 l-6 6 h12 z`, class: 'l' });

// A wardrobe interior: shelves and a rail with hangers, drawn behind the doors.
const interior = (x, y, width, height) => [
  rect(x, y, width, height, 'p'),
  line(x + 3, y + height * 0.3, x + width - 3, y + height * 0.3),
  line(x + 3, y + height * 0.65, x + width - 3, y + height * 0.65),
];

const SCENES = {
  // Guide me: a short Q&A, then the proposed wardrobe appears.
  guided: () => [
    group('m ill-bubble ill-bubble--1', [
      rect(14, 12, 64, 24, 'p', 10),
      svg('circle', { cx: 34, cy: 24, r: 3, class: 'a ill-dot ill-dot--1' }),
      svg('circle', { cx: 46, cy: 24, r: 3, class: 'a ill-dot ill-dot--2' }),
      svg('circle', { cx: 58, cy: 24, r: 3, class: 'a ill-dot ill-dot--3' }),
    ]),
    group('m ill-bubble ill-bubble--2', [
      rect(30, 46, 56, 24, 's', 10),
      line(42, 58, 74, 58),
    ]),
    group('m ill-appear', [
      rect(102, 14, 44, 70, 's'),
      line(124, 14, 124, 84),
      handle(119, 44), handle(127, 44),
    ]),
  ],
  // Describe it: a page being written, the pencil moving along the lines.
  freeText: () => [
    rect(28, 10, 80, 76, 's', 4),
    line(40, 28, 96, 28, 'l ill-write ill-write--1'),
    line(40, 44, 90, 44, 'l ill-write ill-write--2'),
    line(40, 60, 82, 60, 'l ill-write ill-write--3'),
    group('m ill-pencil', [
      svg('path', { d: 'M104 66 l26 -26 l8 8 l-26 26 l-11 3 z', class: 'p' }),
      svg('path', { d: 'M104 66 l-3 11 l11 -3', class: 'a' }),
    ]),
  ],
  // Basic wardrobe: three hinged doors swing open onto shelves and a rail.
  basic: () => [
    rect(38, 8, 84, 80, 's'),
    ...interior(41, 11, 78, 74),
    hanger(80, 34),
    group('m ill-door ill-door--left', [rect(41, 11, 26, 74, 's'), handle(62, 42)]),
    group('m ill-door ill-door--left', [rect(67, 11, 26, 74, 's'), handle(70, 42)]),
    group('m ill-door ill-door--right', [rect(93, 11, 26, 74, 's'), handle(96, 42)]),
  ],
  // Kids: a low wardrobe, a star that bounces and a door that opens onto drawers.
  kids: () => [
    svg('path', { d: 'M80 6 l4 8 l9 1 l-7 6 l2 9 l-8 -5 l-8 5 l2 -9 l-7 -6 l9 -1 z', class: 'a m ill-star' }),
    rect(50, 36, 60, 52, 's'),
    rect(53, 39, 26, 46, 'p'),
    line(56, 52, 76, 52),
    rect(81, 62, 26, 10, 'p'), rect(81, 74, 26, 10, 'p'),
    group('m ill-door ill-door--left', [rect(53, 39, 26, 46, 's'), handle(74, 56)]),
    rect(81, 39, 26, 21, 's'),
  ],
  // Double, sliding doors: the front door slides across to show the hanging space.
  double_sliding: () => [
    rect(20, 12, 120, 74, 's'),
    ...interior(23, 15, 114, 68),
    hanger(46, 26), hanger(60, 26),
    rect(80, 15, 57, 68, 's'),
    line(108, 22, 108, 76),
    group('m ill-slide', [rect(23, 15, 57, 68, 's'), line(51, 22, 51, 76)]),
  ],
  // Minimalist: two plain doors; one opens and the hanger inside swings.
  minimalist: () => [
    rect(50, 8, 60, 80, 's'),
    rect(53, 11, 54, 74, 'p'),
    line(56, 24, 104, 24),
    svg('g', { class: 'm ill-swing' }, [hanger(92, 24)]),
    group('', [rect(53, 11, 27, 74, 's'), handle(75, 44)]),
    group('m ill-door ill-door--right', [rect(80, 11, 27, 74, 's'), handle(83, 44)]),
  ],
};

/** The decorative SVG scene for an entry point or template id. */
export function illustration(id) {
  const scene = SCENES[id];
  if (!scene) throw new Error(`no illustration for ${id}`);
  return svg('svg', {
    class: `ill ill--${id}`, viewBox: '0 0 160 96', 'aria-hidden': 'true', focusable: 'false',
  }, scene());
}

export const ILLUSTRATION_IDS = Object.freeze(Object.keys(SCENES));
