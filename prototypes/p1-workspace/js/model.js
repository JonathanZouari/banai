// P1 prototype data model. Mock data, integer millimetres throughout.
// The production model is the canonical schema in docs/schema.md; this file only
// covers what the prototype needs to show the workspace, the advisories and the render.

const PH = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg';
const phMaps = (asset, diffuse = 'diff') => ({
  map: `${PH}/2k/${asset}/${asset}_${diffuse}_2k.jpg`,
  thumb: `${PH}/1k/${asset}/${asset}_${diffuse}_1k.jpg`,
  normalMap: `${PH}/1k/${asset}/${asset}_nor_gl_1k.jpg`,
  roughnessMap: `${PH}/1k/${asset}/${asset}_rough_1k.jpg`,
});

// Decor = what a carpenter actually orders: one board product (code, substrate,
// thickness, finish, texture). Codes are illustrative, not real supplier codes.
// Wood textures are CC0 scans from Poly Haven; `size` is the real-world width of
// one texture tile in mm, so grain renders at true scale.
export const DECORS = [
  { id: 'snow', name: 'לבן שלג', code: 'BN-W100', substrate: 'מלמין', color: '#f0efeb', roughness: 0.62 },
  { id: 'cashmere', name: 'קשמיר', code: 'BN-U702', substrate: 'מלמין', color: '#d6cab8', roughness: 0.6 },
  { id: 'stone', name: 'אפור אבן', code: 'BN-U732', substrate: 'מלמין', color: '#9d9a94', roughness: 0.58 },
  { id: 'graphite', name: 'גרפיט', code: 'BN-U961', substrate: 'מלמין', color: '#3b3c3e', roughness: 0.52 },
  { id: 'oak', name: 'אלון טבעי', code: 'BN-H1145', substrate: 'מלמין', size: 1830, roughness: 0.6, ...phMaps('oak_veneer_01') },
  { id: 'light_oak', name: 'אלון בהיר', code: 'BN-H3303', substrate: 'מלמין', size: 600, roughness: 0.6, ...phMaps('fine_grained_wood', 'col') },
  { id: 'walnut', name: 'אגוז', code: 'BN-H3734', substrate: 'פורניר', size: 1800, roughness: 0.5, ...phMaps('walnut_veneer') },
];
export const decorById = (id) => DECORS.find((d) => d.id === id) ?? DECORS[0];

export const ROOM_TEXTURES = {
  floor: { size: 1700, ...phMaps('laminate_floor_02') },
  wall: { size: 2000, ...phMaps('painted_plaster_wall') },
};

export const PRESETS = [
  { id: 'long', name: 'תלייה ארוכה' },
  { id: 'double', name: 'תלייה כפולה' },
  { id: 'shelves', name: 'מדפים' },
  { id: 'drawers', name: 'מגירות ומדפים' },
];

// Interior inserts: each one is a definition (where it may go, what it replaces), not special code.
export const INSERTS = [
  { id: 'pulldown', name: 'מתקן תלייה נשלף', presets: ['long', 'double'] },
  { id: 'shoes', name: 'מדפי נעליים', presets: ['long', 'shelves'], excludes: ['trousers'] },
  { id: 'trousers', name: 'מתקן מכנסיים', presets: ['double', 'shelves'], excludes: ['shoes'] },
  { id: 'led', name: 'תאורת LED', presets: ['long', 'double', 'shelves', 'drawers'] },
];
export const SHOE_TIER = 240; // tier height 220–260 mm [35]
export const SHOE_TIERS = 3;
export const TROUSER_ZONE = 720;
export const PULLDOWN_WIDTH = [830, 1150]; // pull-down rail sizes on the Israeli market [43]

/** Why an insert can't go into a compartment, or null when it can. */
export function insertBlocked(id, comp) {
  const def = INSERTS.find((d) => d.id === id);
  if (!def.presets.includes(comp.preset)) return `לא מתאים לסידור "${PRESETS.find((p) => p.id === comp.preset).name}"`;
  const clash = (def.excludes ?? []).find((x) => (comp.inserts ?? []).includes(x));
  if (clash) return `לא יחד עם ${INSERTS.find((d) => d.id === clash).name}`;
  return null;
}

// Research-backed constants (docs/research/carpentry-wardrobes-research.md).
export const PANEL = 17; // Israeli standard melamine [59–62]
export const PLINTH = 60;
export const DOOR_GAP = 3;
export const SLIDE_OVERLAP = 20; // [14]
export const SLIDE_TRACK_DEPTH = 100; // +80–100 mm for the tracks [11][15]
const BOARD_KG_M2 = 11.6; // melamine on 17.6 mm board [7]
const MIRROR_KG_M2 = 10; // 2.5 kg/m² per mm × 4 mm glass [17]

export function createState() {
  return {
    site: { ceiling: 2600, niche: 2460 },
    body: { width: 2400, height: 2400, depth: 600 },
    doors: { type: 'hinged', handle: 'bar', mirror: false },
    compartments: [
      { preset: 'long', split: false, inserts: [] },
      { preset: 'double', split: false, inserts: [] },
      { preset: 'drawers', split: false, inserts: [] },
    ],
    decor: { body: 'snow', front: 'oak' },
  };
}

export const LIMITS = {
  width: [800, 4000], height: [1600, 2800], depth: [450, 750],
  ceiling: [2200, 3200], niche: [800, 4200], compartments: [1, 6],
};

// Hinge count by door height and weight, whichever needs more (Blum/Häfele tables [3][5]).
export function hingesFor(heightMm, kg) {
  const byHeight = heightMm <= 900 ? 2 : heightMm <= 1600 ? 3 : heightMm <= 2030 ? 4 : heightMm <= 2490 ? 5 : 6;
  const byWeight = kg <= 6.8 ? 2 : kg <= 13.6 ? 3 : kg <= 20.4 ? 4 : kg <= 27.2 ? 5 : 6;
  return Math.max(byHeight, byWeight);
}

/** Derive everything geometric from the state. Pure: state in, layout out. */
export function layout(state) {
  const { width: W, height: H, depth: D } = state.body;
  const n = state.compartments.length;
  const interiorW = W - 2 * PANEL;
  const interiorH = H - PLINTH - 2 * PANEL;
  const sliding = state.doors.type === 'sliding';
  const shelfDepth = sliding ? D - SLIDE_TRACK_DEPTH - 10 : D - 25;

  // Equal compartment widths; the integer remainder goes to the leftmost ones.
  const base = Math.floor((interiorW - (n - 1) * PANEL) / n);
  let rest = interiorW - (n - 1) * PANEL - base * n;
  let x = PANEL;
  const comps = state.compartments.map((c, i) => {
    const w = base + (rest-- > 0 ? 1 : 0);
    // Drop inserts the current preset can't hold (e.g. after a preset change).
    const inserts = (c.inserts ?? []).filter((id) => INSERTS.find((d) => d.id === id)?.presets.includes(c.preset));
    const comp = { index: i, x0: x, w, preset: c.preset, split: c.split, inserts, ...interior(c.preset, interiorH, inserts) };
    x += w + PANEL;
    return comp;
  });

  const doorH = H - PLINTH - DOOR_GAP;
  const doors = [];
  if (state.doors.type === 'hinged') {
    comps.forEach((c, i) => {
      const left = i === 0 ? 0 : c.x0 - PANEL / 2;
      const right = i === n - 1 ? W : c.x0 + c.w + PANEL / 2;
      const leaves = c.split ? 2 : 1;
      const leafW = (right - left) / leaves;
      for (let k = 0; k < leaves; k++) {
        const x0 = left + k * leafW + DOOR_GAP / 2;
        const w = Math.round(leafW - DOOR_GAP);
        const hinge = leaves === 2 ? (k === 0 ? 'left' : 'right') : (c.x0 + c.w / 2 < W / 2 ? 'left' : 'right');
        doors.push({ id: `door-${i}-${k}`, comp: i, x0, w, h: doorH, hinge });
      }
    });
  } else if (sliding) {
    const panels = W <= 2000 ? 2 : W <= 3200 ? 3 : 4;
    const innerW = W - 2 * PANEL;
    const pw = Math.round((innerW + (panels - 1) * SLIDE_OVERLAP) / panels);
    for (let k = 0; k < panels; k++) {
      const x0 = PANEL + k * (pw - SLIDE_OVERLAP);
      // Alternate tracks: outer panels at the back, inner ones in front.
      const track = panels === 3 ? (k === 1 ? 'front' : 'back') : (k % 2 === 0 ? 'back' : 'front');
      doors.push({ id: `slide-${k}`, comp: null, x0, w: pw, h: H - PLINTH - 2 * PANEL - 4, track, k });
    }
  }

  // Mirror on the door nearest the centre.
  if (state.doors.mirror && doors.length) {
    const mid = W / 2;
    const target = doors.reduce((best, d) => (Math.abs(d.x0 + d.w / 2 - mid) < Math.abs(best.x0 + best.w / 2 - mid) ? d : best));
    target.mirror = true;
  }
  for (const d of doors) {
    const m2 = (d.w * d.h) / 1e6;
    d.kg = m2 * (BOARD_KG_M2 + (d.mirror ? MIRROR_KG_M2 : 0));
    d.hinges = state.doors.type === 'hinged' ? hingesFor(d.h, d.kg) : 0;
  }

  return { W, H, D, n, interiorW, interiorH, shelfDepth, comps, doors, sliding };
}

// Interior items in compartment coordinates: y from the top face of the bottom panel.
function interior(preset, Hi, inserts = []) {
  const base = presetInterior(preset, Hi);
  let { shelves, rails, drawers } = base;
  let hangFloor = 0;
  let pulldown = null;
  let shoes = null;
  let trousers = null;
  if (inserts.includes('pulldown') && rails.length) {
    pulldown = { y: rails[0] }; // replaces the top rail
    rails = rails.slice(1);
  }
  if (inserts.includes('shoes')) {
    const top = SHOE_TIERS * SHOE_TIER;
    shoes = Array.from({ length: SHOE_TIERS }, (_, k) => ({ y: k * SHOE_TIER, h: SHOE_TIER }));
    shelves = [top, ...shelves.filter((y) => y > top + 60)];
    hangFloor = top + PANEL;
  }
  if (inserts.includes('trousers')) {
    trousers = { y: TROUSER_ZONE - 60, h: TROUSER_ZONE };
    rails = rails.filter((y) => y > TROUSER_ZONE + 400);
    shelves = [TROUSER_ZONE, ...shelves.filter((y) => y > TROUSER_ZONE + 60)];
  }
  shelves.sort((a, b) => a - b);
  return { shelves, rails, drawers, pulldown, shoes, trousers, led: inserts.includes('led'), hangFloor };
}

function presetInterior(preset, Hi) {
  const shelves = [];
  const rails = [];
  const drawers = [];
  const hatShelf = Hi - 330;
  if (preset === 'long') {
    shelves.push(hatShelf);
    rails.push(hatShelf - 70);
  } else if (preset === 'double') {
    shelves.push(hatShelf);
    rails.push(hatShelf - 70);
    const mid = Math.round(Hi * 0.46);
    shelves.push(mid);
    rails.push(mid - 70);
  } else if (preset === 'shelves') {
    const count = Math.max(2, Math.round(Hi / 360));
    for (let k = 1; k < count; k++) shelves.push(Math.round((k * Hi) / count));
  } else if (preset === 'drawers') {
    const fh = 230;
    for (let k = 0; k < 3; k++) drawers.push({ y: k * fh, h: fh - 6 });
    const top = 3 * fh + 10;
    shelves.push(top);
    const count = Math.max(1, Math.round((Hi - top) / 360));
    for (let k = 1; k < count; k++) shelves.push(Math.round(top + (k * (Hi - top)) / count));
  }
  return { shelves, rails, drawers };
}

export const cm = (mm) => {
  const v = Math.round(mm) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
