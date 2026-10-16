// P1 workspace: wires the model, the advisory layer, the inspector and the 3D viewer.
// One state object; every edit goes state → layout → (viewer, advisories, inspector).
import { createState, layout, DECORS, PRESETS, INSERTS, LIMITS, decorById, insertBlocked, cm } from './model.js';
import { advisories } from './advisories.js';
import { Viewer } from './scene.js';
import { diff } from './diff.js';
import { createAgent } from './agent.js';
import { PushToTalk } from './voice.js';

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...kids);
  return n;
};
const svg = (markup, cls = '') => {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const s = t.content.firstElementChild;
  if (cls) s.setAttribute('class', cls);
  return s;
};

const ICONS = {
  critical: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="currentColor"/><path d="M10 5.6v5.4" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/><circle cx="10" cy="14" r="1.15" fill="#fff"/></svg>',
  warn: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.6 2.9a1.6 1.6 0 0 1 2.8 0l6.9 12.2a1.6 1.6 0 0 1-1.4 2.4H3.1a1.6 1.6 0 0 1-1.4-2.4z" fill="currentColor"/><path d="M10 7v4.6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="14.4" r="1.05" fill="#fff"/></svg>',
  info: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="6.4" r="1.05" fill="currentColor"/><path d="M10 9v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
};
// Mini elevations of each interior preset (28×36 viewBox).
const PRESET_ART = {
  long: '<svg viewBox="0 0 28 36" aria-hidden="true"><rect x="2" y="1.5" width="24" height="33" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 8h24M5 11h18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M9 11v17M14 11v20M19 11v15" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".55"/></svg>',
  double: '<svg viewBox="0 0 28 36" aria-hidden="true"><rect x="2" y="1.5" width="24" height="33" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 8h24M5 10.5h18M2 19h24M5 21.5h18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M9 10.5v6M14 10.5v7M19 10.5v5.5M9 21.5v8M14 21.5v9M19 21.5v7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".55"/></svg>',
  shelves: '<svg viewBox="0 0 28 36" aria-hidden="true"><rect x="2" y="1.5" width="24" height="33" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 8h24M2 14.5h24M2 21h24M2 27.5h24" stroke="currentColor" stroke-width="1.4"/></svg>',
  drawers: '<svg viewBox="0 0 28 36" aria-hidden="true"><rect x="2" y="1.5" width="24" height="33" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 8h24M2 14.5h24M2 20.5h24" stroke="currentColor" stroke-width="1.4"/><rect x="4" y="22.5" width="20" height="3.4" rx=".8" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="4" y="27" width="20" height="3.4" rx=".8" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12 24.2h4M12 28.7h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
};

const FIELDS = [
  { group: 'site', path: ['site', 'ceiling'], label: 'גובה תקרה', limits: LIMITS.ceiling, step: 10 },
  { group: 'site', path: ['site', 'niche'], label: 'רוחב נישה', hint: 'הקטן מבין שלוש מדידות', limits: LIMITS.niche, step: 10 },
  { group: 'body', path: ['body', 'width'], label: 'רוחב', limits: LIMITS.width, step: 10 },
  { group: 'body', path: ['body', 'height'], label: 'גובה', limits: LIMITS.height, step: 10 },
  { group: 'body', path: ['body', 'depth'], label: 'עומק', limits: LIMITS.depth, step: 10 },
];

const state = createState();
let L = layout(state);
let selected = null;
let hovered = null;
const view = { doorsOpen: false, dims: true, angle: 'three' };

const viewer = new Viewer($('#viewport'), {
  onSelect: (i) => select(i),
  onHover: (i) => { hovered = i; syncCompStrip(); },
});

// ---------- state pipeline ----------
const get = (path) => path.reduce((o, k) => o[k], state);
const set = (path, v) => { path.slice(0, -1).reduce((o, k) => o[k], state)[path.at(-1)] = v; };
const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v));

// Undo history: a snapshot before each edit. Rapid edits of the same control (a slider drag,
// arrow keys) collapse into one step, so undo goes back a whole gesture, not one pixel.
const history = { past: [], future: [], key: null, at: 0 };
const snapshot = () => structuredClone(state);
let rev = 0; // bumps on every change; AI proposals made against an older rev are stale

let frame = 0;
function commit(mutate, key = 'edit') {
  if (viewer.rendering) exitRender();
  const now = performance.now();
  if (!(key !== 'edit' && key === history.key && now - history.at < 700)) {
    history.past.push(snapshot());
    if (history.past.length > 100) history.past.shift();
  }
  history.future = [];
  history.key = key;
  history.at = now;
  mutate?.(state);
  normalize();
}
function normalize() {
  for (const f of FIELDS) set(f.path, clamp(Math.round(get(f.path)), f.limits));
  if (state.compartments.length > LIMITS.compartments[1]) state.compartments.length = LIMITS.compartments[1];
  for (const c of state.compartments) c.inserts ??= [];
  if (selected != null && selected >= state.compartments.length) selected = null;
  L = layout(state);
  rev++;
  if (!frame) frame = requestAnimationFrame(flush);
}
function restore(snap) {
  if (viewer.rendering) exitRender();
  for (const k of Object.keys(snap)) state[k] = structuredClone(snap[k]);
  history.key = null;
  normalize();
}
function undo() {
  if (!history.past.length) return;
  history.future.push(snapshot());
  restore(history.past.pop());
  toast('בוטל');
}
function redo() {
  if (!history.future.length) return;
  history.past.push(snapshot());
  restore(history.future.pop());
  toast('בוצע שוב');
}
function flush() {
  frame = 0;
  viewer.select(selected);
  viewer.build(state, L);
  syncInspector();
  renderAdvice();
  syncProposals();
}

// ---------- inspector ----------
const fieldEls = new Map();
function buildFields() {
  for (const f of FIELDS) {
    const card = document.querySelector(`[data-fields="${f.group}"]`);
    const num = el('input', { class: 'num', inputmode: 'decimal', 'aria-label': f.label });
    const range = el('input', { type: 'range', min: f.limits[0], max: f.limits[1], step: f.step, 'aria-label': f.label });
    const key = f.path.join('.');
    range.addEventListener('input', () => commit(() => set(f.path, Number(range.value)), key));
    const apply = () => {
      const v = parseFloat(num.value.replace(',', '.'));
      if (Number.isFinite(v)) commit(() => set(f.path, Math.round(v * 10)), key);
      else syncInspector();
    };
    num.addEventListener('change', apply);
    num.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { apply(); num.blur(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 100 : 10);
        commit(() => set(f.path, get(f.path) + d), key);
      }
    });
    const label = el('span', { class: 'field-label' }, f.label);
    if (f.hint) label.append(el('small', {}, f.hint));
    card.append(el('div', { class: 'field' },
      el('div', { class: 'field-head' }, label, el('span', { class: 'field-value' }, num, el('span', { class: 'unit' }, 'ס״מ'))),
      range));
    fieldEls.set(f, { num, range });
  }
}

function segmented(root, options, onPick) {
  root.replaceChildren(el('span', { class: 'seg-thumb', 'aria-hidden': 'true' }));
  for (const o of options) {
    root.append(el('button', { type: 'button', role: 'radio', 'data-value': o.value, 'aria-checked': 'false', onclick: () => onPick(o.value) }, o.label));
  }
  let first = true;
  return (value) => {
    const thumb = root.firstElementChild;
    let active = null;
    for (const b of root.querySelectorAll('button')) {
      const on = b.dataset.value === value;
      b.setAttribute('aria-checked', String(on));
      if (on) active = b;
    }
    if (!active) return;
    if (first) thumb.style.transition = 'none';
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
    if (first) { thumb.getBoundingClientRect(); thumb.style.transition = ''; first = false; }
  };
}

const syncDoorType = segmented($('#doorType'), [
  { value: 'hinged', label: 'ציר' }, { value: 'sliding', label: 'הזזה' }, { value: 'none', label: 'ללא' },
], (v) => commit((s) => { s.doors.type = v; }));
const syncHandle = segmented($('#handle'), [
  { value: 'bar', label: 'מוט' }, { value: 'edge', label: 'פרופיל' }, { value: 'none', label: 'לחיצה' },
], (v) => commit((s) => { s.doors.handle = v; }));
const syncView = segmented($('#viewSeg'), [
  { value: 'front', label: 'חזית' }, { value: 'three', label: '¾' }, { value: 'side', label: 'צד' },
], (v) => { view.angle = v; viewer.frame(v); syncView(v); });

function switchEl(node, onToggle) {
  node.addEventListener('click', () => onToggle(node.getAttribute('aria-checked') !== 'true'));
  return (on) => node.setAttribute('aria-checked', String(on));
}
const syncMirror = switchEl($('#mirror'), (on) => commit((s) => { s.doors.mirror = on; }));
const syncSplit = switchEl($('#split'), (on) => commit((s) => { if (selected != null) s.compartments[selected].split = on; }));

function buildSwatches(root, slot) {
  for (const d of DECORS) {
    const b = el('button', {
      type: 'button', class: 'swatch', role: 'radio', 'aria-checked': 'false', 'data-id': d.id,
      'aria-label': `${d.name} ${d.code}`, title: `${d.name} · ${d.code}`,
      onclick: () => commit((s) => { s.decor[slot] = d.id; }),
    });
    b.style.background = d.thumb ? `url("${d.thumb}") center / 240% auto` : d.color;
    root.append(b);
  }
}

const presetGrid = $('#presetGrid');
for (const p of PRESETS) {
  const b = el('button', {
    type: 'button', class: 'preset', role: 'radio', 'aria-checked': 'false', 'data-value': p.id,
    onclick: () => commit((s) => { if (selected != null) s.compartments[selected].preset = p.id; }),
  });
  b.append(svg(PRESET_ART[p.id]), el('span', {}, p.name));
  presetGrid.append(b);
}

const INSERT_ART = {
  pulldown: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.5h12M6 4.5l2 6M14 4.5l-2 6M7 10.5h6M10 10.5v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  shoes: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8l14-2M3 13l14-2M3 18l14-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  trousers: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M5.5 5v11M8.5 5v11M11.5 5v11M14.5 5v11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  led: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M6 8l-1 2M10 8.5v2.5M14 8l1 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};
for (const d of INSERTS) {
  const b = el('button', {
    type: 'button', class: 'insert', 'data-id': d.id, 'aria-pressed': 'false',
    onclick: () => commit((s) => {
      if (selected == null) return;
      const c = s.compartments[selected];
      c.inserts = c.inserts.includes(d.id) ? c.inserts.filter((x) => x !== d.id) : [...c.inserts, d.id];
    }),
  });
  b.append(svg(INSERT_ART[d.id]), el('span', {}, d.name));
  $('#insertGrid').append(b);
}

function syncCompStrip() {
  const strip = $('#compStrip');
  if (strip.children.length !== L.comps.length) {
    strip.replaceChildren(...L.comps.map((c) => el('button', { type: 'button', class: 'comp-tile', onclick: () => select(selected === c.index ? null : c.index) })));
  }
  L.comps.forEach((c, i) => {
    const t = strip.children[i];
    t.replaceChildren(svg(PRESET_ART[c.preset]), el('span', { class: 'ct-name' }, `תא ${i + 1}`), el('span', { class: 'ct-w' }, `${cm(c.w)} ס״מ`));
    t.setAttribute('aria-pressed', String(selected === i));
    t.setAttribute('aria-label', `תא ${i + 1}, ${PRESETS.find((p) => p.id === c.preset).name}, ${cm(c.w)} ס״מ`);
    t.classList.toggle('is-hover', hovered === i && selected !== i);
  });
}

function syncInspector() {
  for (const [f, { num, range }] of fieldEls) {
    const v = get(f.path);
    if (document.activeElement !== num) num.value = cm(v);
    if (document.activeElement !== range) range.value = v;
    range.style.setProperty('--p', `${((v - f.limits[0]) / (f.limits[1] - f.limits[0])) * 100}%`);
  }
  syncDoorType(state.doors.type);
  syncHandle(state.doors.handle);
  syncMirror(state.doors.mirror);
  $('#handle').closest('.row').hidden = state.doors.type === 'none';
  $('#mirror').closest('.row').hidden = state.doors.type === 'none';
  $('#compCount').textContent = String(state.compartments.length);
  $('#compMinus').disabled = state.compartments.length <= LIMITS.compartments[0];
  $('#compPlus').disabled = state.compartments.length >= LIMITS.compartments[1];
  syncCompStrip();

  const detail = $('#compDetail');
  detail.hidden = selected == null;
  if (selected != null) {
    const c = L.comps[selected];
    $('#compDetailTitle').textContent = `סידור תא ${selected + 1} · ${cm(c.w)} ס״מ`;
    for (const b of presetGrid.children) b.setAttribute('aria-checked', String(b.dataset.value === c.preset));
    $('#splitRow').hidden = state.doors.type !== 'hinged';
    syncSplit(state.compartments[selected].split);
    for (const b of $('#insertGrid').children) {
      const id = b.dataset.id;
      const on = c.inserts.includes(id);
      const why = on ? null : insertBlocked(id, c);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = Boolean(why);
      b.title = why ?? '';
    }
  }
  $('#undoBtn').disabled = !history.past.length;
  $('#redoBtn').disabled = !history.future.length;
  for (const [slot, root, name] of [['body', '#bodyDecor', '#bodyDecorName'], ['front', '#frontDecor', '#frontDecorName']]) {
    for (const b of $(root).children) b.setAttribute('aria-checked', String(b.dataset.id === state.decor[slot]));
    const d = decorById(state.decor[slot]);
    $(name).textContent = `${d.name} · ${d.substrate} · ${d.code}`;
  }

  const chip = $('#selChip');
  chip.hidden = selected == null;
  if (selected != null) {
    const c = L.comps[selected];
    $('#selText').textContent = `תא ${selected + 1} · ${cm(c.w)} ס״מ · ${PRESETS.find((p) => p.id === c.preset).name}`;
  }
}

function select(i) {
  selected = i ?? null;
  viewer.select(selected);
  syncInspector();
}

// ---------- advisories ----------
const listEl = $('#adviceList');
const cards = new Map();
const GRADE_LABEL = (g) => g;

function adviceCard(a) {
  const wrap = el('div', { class: 'advice-wrap is-entering', 'data-id': a.id });
  wrap.append(el('article', { class: 'advice' }));
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.remove('is-entering')));
  return wrap;
}

function fillCard(wrap, a) {
  const art = wrap.firstElementChild;
  art.className = `advice advice--${a.level}`;
  const meta = el('div', { class: 'advice-meta' },
    el('span', { class: 'grade' }, GRADE_LABEL(a.grade)),
    el('span', { class: 'src' }, a.src),
    el('span', { class: 'meta-spacer' }),
    el('button', { type: 'button', class: 'link-btn', onclick: () => showTargets(a) }, 'הצג'));
  if (a.fix) {
    meta.append(el('button', {
      type: 'button', class: 'fix-btn',
      onclick: () => { commit(a.fix.apply); toast(`עודכן: ${a.fix.label}`); },
    }, a.fix.label));
  }
  const inner = el('div', { class: 'advice-inner' },
    svg(ICONS[a.level], 'advice-icon'),
    el('div', { class: 'advice-main' }, el('h3', { class: 'advice-title' }, a.title), el('p', { class: 'advice-text' }, a.body), meta));
  art.replaceChildren(inner);
}

function renderAdvice() {
  const list = advisories(state, L);
  const ids = new Set(list.map((a) => a.id));
  for (const [id, wrap] of cards) {
    if (ids.has(id)) continue;
    cards.delete(id);
    wrap.classList.add('is-leaving');
    setTimeout(() => wrap.remove(), 240);
  }
  let prev = null;
  for (const a of list) {
    let wrap = cards.get(a.id);
    if (!wrap) { wrap = adviceCard(a); cards.set(a.id, wrap); }
    fillCard(wrap, a);
    const want = prev ? prev.nextElementSibling : listEl.firstElementChild;
    if (want !== wrap) listEl.insertBefore(wrap, want);
    prev = wrap;
  }
  const by = (lv) => list.filter((a) => a.level === lv).length;
  const counts = $('#counts');
  counts.replaceChildren();
  if (by('critical')) counts.append(el('span', { class: 'count count--critical' }, `${by('critical')} חוסם`));
  if (by('warn')) counts.append(el('span', { class: 'count count--warn' }, `${by('warn')} ${by('warn') === 1 ? 'אזהרה' : 'אזהרות'}`));
  if (!by('critical') && !by('warn')) counts.append(el('span', { class: 'count count--ok' }, 'אין אזהרות'));
  counts.append(el('span', { class: 'count count--info' }, `${by('info')} מידע`));
}

function showTargets(a) {
  const interior = a.targets.some((t) => t.startsWith('comp:'));
  if (interior && !view.doorsOpen && state.doors.type !== 'none') setDoors(true);
  const comp = a.targets.find((t) => t.startsWith('comp:'));
  if (comp) select(Number(comp.slice(5)));
  setTimeout(() => viewer.flash(a.targets), interior ? 380 : 0);
}

// ---------- toolbar, steps, render ----------
function setDoors(open) {
  view.doorsOpen = open;
  viewer.setView({ doorsOpen: open });
  const b = $('#doorsToggle');
  b.setAttribute('aria-pressed', String(open));
  b.querySelector('span').textContent = open ? 'סגור דלתות' : 'פתח דלתות';
}
$('#doorsToggle').addEventListener('click', () => setDoors(!view.doorsOpen));
$('#dimsToggle').addEventListener('click', (e) => {
  view.dims = !view.dims;
  e.currentTarget.setAttribute('aria-pressed', String(view.dims));
  viewer.setView({ dims: view.dims });
});
$('#compPlus').addEventListener('click', () => commit((s) => { s.compartments.push({ preset: 'shelves', split: false, inserts: [] }); }));
$('#compMinus').addEventListener('click', () => commit((s) => { s.compartments.pop(); }));
$('#selClear').addEventListener('click', () => select(null));

const steps = [...document.querySelectorAll('.journey button')];
const setStep = (name) => steps.forEach((b) => (b.dataset.step === name ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
for (const b of steps) {
  b.addEventListener('click', () => {
    const name = b.dataset.step;
    if (name === 'review') { startRender(); setStep(name); return; }
    if (name === 'pdf') { openDossier(); return; }
    setStep(name);
    $(`#sec-${name}`).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
}
const io = new IntersectionObserver((entries) => {
  if (viewer.rendering) return;
  const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
  if (vis) setStep(vis.target.dataset.step);
}, { root: $('#inspector'), threshold: 0.6 });
document.querySelectorAll('.group[data-step]').forEach((s) => io.observe(s));

const hud = $('#renderHud');
const RING = 69.12;
async function startRender() {
  if (viewer.rendering) return;
  select(null);
  document.body.classList.add('is-rendering');
  hud.hidden = false;
  hud.classList.remove('is-done');
  $('#saveImg').hidden = true;
  $('#hudTitle').textContent = 'רינדור פוטוריאליסטי';
  $('#hudSub').textContent = 'טוען מנוע רינדור…';
  $('#ringBar').style.strokeDashoffset = String(RING);
  const t0 = performance.now();
  try {
    await viewer.startRender({
      onProgress: (n, total, compiling) => {
        $('#ringBar').style.strokeDashoffset = String(RING * (1 - n / total));
        if (compiling) {
          $('#hudSub').textContent = 'מכין את מנוע הרינדור (רק בפעם הראשונה)…';
        } else if (n >= total) {
          hud.classList.add('is-done');
          $('#hudTitle').textContent = 'הרינדור מוכן';
          $('#hudSub').textContent = `${total} דגימות · ${((performance.now() - t0) / 1000).toFixed(0)} שנ׳ · מדויק לגיאומטריה`;
          $('#saveImg').hidden = false;
        } else {
          hud.classList.remove('is-done');
          $('#hudTitle').textContent = 'רינדור פוטוריאליסטי';
          $('#hudSub').textContent = `${n} מתוך ${total} דגימות · אפשר לסובב`;
          $('#saveImg').hidden = true;
        }
      },
    });
  } catch (err) {
    console.error(err);
    toast('הרינדור נכשל בדפדפן הזה');
    exitRender();
  }
}
function exitRender() {
  viewer.stopRender();
  document.body.classList.remove('is-rendering');
  hud.hidden = true;
  if (steps.find((b) => b.dataset.step === 'review')?.hasAttribute('aria-current')) setStep('decor');
}
$('#renderBtn').addEventListener('click', () => { setStep('review'); startRender(); });
$('#exitRender').addEventListener('click', exitRender);
$('#saveImg').addEventListener('click', () => {
  const a = el('a', { href: viewer.snapshot(), download: 'banai-render.png' });
  a.click();
});
function openDossier() {
  try { sessionStorage.setItem('banai.dossier.state', JSON.stringify(state)); } catch { /* storage blocked: the dossier shows its demo design */ }
  location.href = '../p2-dossier/';
}
$('#pdfBtn').addEventListener('click', openDossier);

document.addEventListener('keydown', (e) => {
  const typing = e.target.closest?.('input, textarea');
  if ((e.ctrlKey || e.metaKey) && !typing && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if ((e.ctrlKey || e.metaKey) && !typing && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
  if (e.key !== 'Escape') return;
  if (viewer.rendering) exitRender();
  else if (selected != null) select(null);
});
$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);

// ---------- saved version: hold to compare ----------
let versionA = null;
function syncVersion() {
  $('#versionBtn').hidden = Boolean(versionA);
  $('#compareGroup').hidden = !versionA;
}
$('#versionBtn').addEventListener('click', () => { versionA = snapshot(); syncVersion(); toast('נשמרה גרסה. החזיקו "השוואה" כדי לראות אותה'); });
$('#versionClear').addEventListener('click', () => { versionA = null; syncVersion(); });
const compareBtn = $('#compareBtn');
function showVersion(on) {
  if (!versionA || viewer.rendering) return;
  compareBtn.classList.toggle('is-holding', on);
  document.body.classList.toggle('is-comparing', on);
  const card = $('#compareCard');
  if (on) {
    const changes = diff(state, versionA);
    $('#compareList').replaceChildren(...(changes.length ? changes : ['זהה לתכנון הנוכחי']).map((t) => el('li', {}, t)));
    card.hidden = false;
    viewer.build(versionA, layout(versionA));
  } else {
    card.hidden = true;
    viewer.build(state, L);
  }
}
compareBtn.addEventListener('pointerdown', (e) => { compareBtn.setPointerCapture(e.pointerId); showVersion(true); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) compareBtn.addEventListener(ev, () => { if (compareBtn.classList.contains('is-holding')) showVersion(false); });
compareBtn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); showVersion(true); } });
compareBtn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') showVersion(false); });

// ---------- side tabs: advice | chat ----------
let sideTab = 'advice';
const syncTabs = segmented($('#sideTabs'), [{ value: 'advice', label: 'ייעוץ' }, { value: 'chat', label: 'שיחה' }], (v) => setTab(v));
function setTab(v) {
  sideTab = v;
  $('#advisorView').hidden = v !== 'advice';
  $('#chatView').hidden = v !== 'chat';
  syncTabs(v);
  if (v === 'chat') { greet(); requestAnimationFrame(() => $('#chatInput').focus()); }
}
function syncTabBadge() {
  const warns = advisories(state, L).filter((a) => a.level !== 'info').length;
  const tab = $('#sideTabs').querySelector('[data-value="advice"]');
  tab.querySelector('.tab-badge')?.remove();
  if (warns) tab.append(el('span', { class: 'tab-badge' }, String(warns)));
}

// ---------- chat ----------
const agent = createAgent();
const log = $('#chatLog');
const input = $('#chatInput');
const proposals = [];
let greeted = false;

function bubble(cls, text, { voice = false } = {}) {
  const b = el('div', { class: `msg ${cls} is-entering` });
  if (voice) b.append(el('span', { class: 'msg-voice' }, 'הודעה קולית'));
  b.append(text);
  log.append(b);
  requestAnimationFrame(() => requestAnimationFrame(() => b.classList.remove('is-entering')));
  log.scrollTop = log.scrollHeight;
  return b;
}
function greet() {
  if (greeted) return;
  greeted = true;
  // A conversation, not a menu: no suggestion buttons, just an open question (user feedback).
  bubble('msg--agent', `היי, אני בנאי. אני רואה שאתם עובדים על ארון ברוחב ${cm(L.W)} ס״מ עם ${L.n} תאים. ספרו לי מה חשוב לכם בו, מה צריך להיכנס אליו, או מה מפריע לכם בתכנון, ונמשיך משם.`);
}

function proposalCard(p) {
  // Impact preview: run the advisories on the proposed design before anything is applied.
  const after = snapshot();
  p.apply(after);
  const warnsNow = advisories(state, L).filter((a) => a.level !== 'info').length;
  const warnsAfter = advisories(after, layout(after)).filter((a) => a.level !== 'info').length;
  const delta = warnsAfter - warnsNow;
  const card = el('div', { class: 'proposal is-entering' });
  const confirm = el('button', { type: 'button', class: 'btn btn--small btn--primary' }, 'אישור');
  const cancel = el('button', { type: 'button', class: 'btn btn--small btn--quiet' }, 'ביטול');
  const entry = { card, p, baseRev: rev, done: false };
  card.append(
    el('h4', {}, el('span', {}, 'הצעה'), p.title),
    el('ul', {}, ...p.changes.map((c) => el('li', {}, c))),
    el('p', { class: 'impact' }, delta > 0 ? el('b', {}, `+${delta} ${delta === 1 ? 'אזהרה' : 'אזהרות'}`) : delta < 0 ? el('b', { class: 'ok' }, `${-delta} ${-delta === 1 ? 'אזהרה פחות' : 'אזהרות פחות'}`) : 'בלי שינוי באזהרות'),
    el('div', { class: 'proposal-actions' }, confirm, cancel));
  confirm.addEventListener('click', () => {
    if (rev !== entry.baseRev) return;
    commit(p.apply, 'ai');
    finish(entry, 'אושר והוחל ✓');
  });
  cancel.addEventListener('click', () => finish(entry, 'בוטל. התכנון לא השתנה.'));
  proposals.push(entry);
  log.append(card);
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('is-entering')));
  log.scrollTop = log.scrollHeight;
}
function finish(entry, note) {
  entry.done = true;
  entry.card.classList.add('is-done');
  entry.card.querySelector('.stale-note')?.remove();
  entry.card.append(el('span', { class: 'done-note' }, note));
}
// Mirrors the backend's 409 STALE: a proposal made against an older design can't be applied.
function syncProposals() {
  syncTabBadge();
  for (const e of proposals) {
    if (e.done) continue;
    const stale = rev !== e.baseRev;
    e.card.classList.toggle('is-stale', stale);
    e.card.querySelector('.btn--primary').disabled = stale;
    if (stale && !e.card.querySelector('.stale-note')) {
      e.card.querySelector('.proposal-actions').before(el('p', { class: 'stale-note' }, 'התכנון השתנה מאז ההצעה. בקשו הצעה חדשה.'));
    }
  }
}

async function send(text, { voice = false } = {}) {
  const t = text.trim();
  if (!t) return;
  bubble('msg--user', t, { voice });
  input.value = '';
  autosize();
  const typing = el('div', { class: 'typing', 'aria-label': 'בנאי מקליד' }, el('i'), el('i'), el('i'));
  log.append(typing);
  log.scrollTop = log.scrollHeight;
  const res = await agent.reply(t, { state: snapshot(), adv: advisories(state, L) });
  typing.remove();
  bubble('msg--agent', res.text);
  if (res.proposal) proposalCard(res.proposal);
}
function autosize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(120, input.scrollHeight)}px`;
  $('#sendBtn').disabled = !input.value.trim();
}
input.addEventListener('input', autosize);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
$('#composer').addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });

// ---------- voice ----------
const composer = $('#composer');
const bars = [...document.querySelectorAll('#voiceBars i')];
let ghost = null;
const voice = new PushToTalk($('#micBtn'), {
  onStart: () => { composer.classList.add('is-recording'); $('#voiceHint').textContent = 'משחררים לשליחה · גוררים הצידה לביטול'; },
  onToggleMode: () => { $('#voiceHint').textContent = 'מקליט. לחצו שוב כדי לשלוח'; },
  onLevel: (v) => {
    composer.style.setProperty('--lvl', v.toFixed(2));
    bars.forEach((b, i) => { b.style.height = `${4 + v * 18 * (0.55 + 0.45 * Math.sin(i * 1.3 + performance.now() / 120) ** 2)}px`; });
  },
  onPartial: (t) => { ghost ??= bubble('msg--user msg--ghost', ''); ghost.textContent = t; log.scrollTop = log.scrollHeight; },
  onArmCancel: (armed) => { composer.classList.toggle('is-cancel', armed); $('#voiceHint').textContent = armed ? 'שחררו כדי לבטל' : 'משחררים לשליחה · גוררים הצידה לביטול'; },
  onFinal: (t) => { endVoice(); send(t, { voice: true }); },
  onCancel: (msg) => { endVoice(); if (msg) toast(msg); },
  onError: (msg) => { endVoice(); toast(msg); },
});
function endVoice() {
  composer.classList.remove('is-recording', 'is-cancel');
  bars.forEach((b) => { b.style.height = ''; });
  ghost?.remove();
  ghost = null;
}

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
}

// ---------- boot ----------
buildFields();
buildSwatches($('#bodyDecor'), 'body');
buildSwatches($('#frontDecor'), 'front');
flush();
viewer.frame('three', false);
syncView('three');
setStep('site');
setTab('advice');
syncVersion();
viewer.ready().then(() => {
  $('#loading').classList.add('is-hidden');
  // Compile the path tracer in the background so the first render starts at once.
  (window.requestIdleCallback ?? setTimeout)(() => viewer.prewarm().catch((e) => console.warn('prewarm', e)), { timeout: 2000 });
});
window.__banai = { state, viewer, voice, send, setTab, undo, redo, flush: () => { cancelAnimationFrame(frame); flush(); }, get layout() { return L; }, get history() { return history; } };
