// The signature: a pencil dimension line that draws itself (line, end ticks, a label in a pill), and
// corner marks that frame a card like a drafting sheet. Pure SVG over the element, sized with a
// ResizeObserver, drawn once when it scrolls into view. Reduced motion: drawn, without the stroke.
const NS = 'http://www.w3.org/2000/svg';
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function svg(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function whenVisible(element, run) {
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      run();
    }
  }, { threshold: 0.4 });
  io.observe(element);
}

/** Draw-in: a stroke from 0 to its full length, then the ticks and the label settle in. */
function drawIn(line, extras, { delay = 0, duration = 900 } = {}) {
  if (reduced()) return;
  line.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
    { duration, delay, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' });
  extras.forEach((node, i) => node.animate([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }],
    { duration: 380, delay: delay + duration * 0.55 + i * 60, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' }));
}

/**
 * A dimension line along one side of `element`: 'below' (default) or 'side'. `label` is the text in the
 * pill (for example "240 ס״מ"); `count` animates a number up to it.
 */
export function measure(element, { label = '', side = 'below', count = null, unit = '', delay = 0, gap = 14 } = {}) {
  element.classList.add('has-measure');
  const host = svg('svg', { class: `measure measure--${side}`, 'aria-hidden': 'true' });
  const line = svg('line', { class: 'measure__line', pathLength: 1 });
  const tickA = svg('line', { class: 'measure__tick' });
  const tickB = svg('line', { class: 'measure__tick' });
  const pill = svg('g', { class: 'measure__pill' });
  const rect = svg('rect', { rx: 10, ry: 10, height: 20 });
  const text = svg('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  pill.append(rect, text);
  host.append(line, tickA, tickB, pill);
  element.append(host);

  const layout = () => {
    const { width, height } = element.getBoundingClientRect();
    const horizontal = side === 'below';
    const w = horizontal ? width : 28;
    const h = horizontal ? 28 : height;
    host.setAttribute('viewBox', `0 0 ${w} ${h}`);
    host.style.width = `${w}px`;
    host.style.height = `${h}px`;
    const [x1, y1, x2, y2] = horizontal ? [1, 14, w - 1, 14] : [14, 1, 14, h - 1];
    Object.entries({ x1, y1, x2, y2 }).forEach(([k, val]) => line.setAttribute(k, val));
    const tick = (node, x, y) => {
      const [dx, dy] = horizontal ? [0, 7] : [7, 0];
      Object.entries({ x1: x - dx, y1: y - dy, x2: x + dx, y2: y + dy }).forEach(([k, val]) => node.setAttribute(k, val));
      node.style.transformOrigin = `${x}px ${y}px`;
    };
    tick(tickA, x1, y1);
    tick(tickB, x2, y2);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    text.setAttribute('x', mx);
    text.setAttribute('y', my);
    const textWidth = Math.max(36, (text.getComputedTextLength?.() || 30) + 18);
    Object.entries({ x: mx - textWidth / 2, y: my - 10, width: textWidth }).forEach(([k, val]) => rect.setAttribute(k, val));
    pill.style.transformOrigin = `${mx}px ${my}px`;
    host.style.setProperty('--gap', `${gap}px`);
  };

  const setText = (value) => {
    text.textContent = value;
    layout();
  };
  setText(count === null ? label : `${count}${unit}`);
  new ResizeObserver(layout).observe(element);

  whenVisible(element, () => {
    drawIn(line, [tickA, tickB, pill], { delay });
    if (count !== null && !reduced()) {
      const started = performance.now() + delay;
      const step = (now) => {
        const p = Math.max(0, Math.min(1, (now - started) / 1100));
        setText(`${Math.round(count * (1 - (1 - p) ** 3))}${unit}`);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  });
  return { setText };
}

/** Corner marks around `element`, like the crop marks of a drawing sheet. `state`: 'idle' | 'confirmed'. */
export function cornerMarks(element, { delay = 0 } = {}) {
  element.classList.add('has-corners');
  const host = svg('svg', { class: 'corners', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  const paths = [0, 1, 2, 3].map(() => svg('path', { class: 'corners__mark', pathLength: 1 }));
  host.append(...paths);
  element.append(host);
  const layout = () => {
    const { width: w, height: h } = element.getBoundingClientRect();
    host.setAttribute('viewBox', `0 0 ${w + 16} ${h + 16}`);
    const L = 16;
    const o = 2; // the marks sit just outside the card
    const d = [
      `M ${o} ${o + L} V ${o} H ${o + L}`,
      `M ${w + 14 - L} ${o} H ${w + 14} V ${o + L}`,
      `M ${w + 14} ${h + 14 - L} V ${h + 14} H ${w + 14 - L}`,
      `M ${o + L} ${h + 14} H ${o} V ${h + 14 - L}`,
    ];
    paths.forEach((p, i) => p.setAttribute('d', d[i]));
  };
  layout();
  new ResizeObserver(layout).observe(element);
  const draw = (extraDelay = 0) => paths.forEach((p, i) => {
    if (reduced()) return;
    p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
      { duration: 520, delay: delay + extraDelay + i * 70, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' });
  });
  whenVisible(element, () => draw());
  return {
    /** A confirmed change: the marks redraw in the accent colour and the card settles. */
    confirm() {
      element.classList.add('is-confirmed');
      draw(0);
      if (!reduced()) {
        element.animate([{ transform: 'scale(0.985)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      }
    },
    reset() {
      element.classList.remove('is-confirmed');
    },
  };
}
