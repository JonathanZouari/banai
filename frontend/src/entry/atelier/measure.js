// The atelier's signature: a pencil dimension line that draws itself (line, end ticks, a label in a pill).
// Pure SVG laid over the element and sized with a ResizeObserver; drawn once when it scrolls into view.
// Reduced motion: drawn at once, without the stroke animation. Decorative: aria-hidden.
import { measureGeometry } from './motion.js';

const NS = 'http://www.w3.org/2000/svg';
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';

function svg(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

/** Runs `run` once, the first time `element` is at least 40% visible inside `root` (the viewport by default). */
export function whenVisible(element, run, { root = null } = {}) {
  if (typeof IntersectionObserver === 'undefined') {
    run();
    return () => {};
  }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      run();
    }
  }, { root, threshold: 0.4 });
  io.observe(element);
  return () => io.disconnect();
}

/**
 * A dimension line along one side of `element`: 'below' (default) or 'side'. `label` is the text in the
 * pill; an empty label hides the pill. Returns { setText(text), dispose() }.
 */
export function measure(element, { label = '', side = 'below', delay = 0, gap = 14, reducedMotion = false, root = null } = {}) {
  element.classList.add('has-measure');
  const host = svg('svg', { class: `measure measure--${side}`, 'aria-hidden': 'true', focusable: 'false' });
  const line = svg('line', { class: 'measure__line', pathLength: 1 });
  const tickA = svg('line', { class: 'measure__tick' });
  const tickB = svg('line', { class: 'measure__tick' });
  const pill = svg('g', { class: 'measure__pill' });
  const rect = svg('rect', { rx: 10, ry: 10, height: 20 });
  const text = svg('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  pill.append(rect, text);
  host.append(line, tickA, tickB, pill);
  host.style.setProperty('--gap', `${gap}px`);
  element.append(host);

  const layout = () => {
    const { width, height } = element.getBoundingClientRect();
    const g = measureGeometry(width, height, side);
    host.setAttribute('viewBox', `0 0 ${g.w} ${g.h}`);
    host.style.width = `${g.w}px`;
    host.style.height = `${g.h}px`;
    Object.entries({ x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 }).forEach(([k, v]) => line.setAttribute(k, v));
    const tick = (node, x, y) => {
      const [dx, dy] = g.horizontal ? [0, 7] : [7, 0];
      Object.entries({ x1: x - dx, y1: y - dy, x2: x + dx, y2: y + dy }).forEach(([k, v]) => node.setAttribute(k, v));
      node.style.transformOrigin = `${x}px ${y}px`;
    };
    tick(tickA, g.x1, g.y1);
    tick(tickB, g.x2, g.y2);
    const mx = (g.x1 + g.x2) / 2;
    const my = (g.y1 + g.y2) / 2;
    text.setAttribute('x', mx);
    text.setAttribute('y', my);
    let measured = 30;
    try {
      measured = text.getComputedTextLength() || measured;
    } catch {
      // not laid out yet (a closed dialog): keep the estimate
    }
    const pillWidth = Math.max(36, measured + 18);
    Object.entries({ x: mx - pillWidth / 2, y: my - 10, width: pillWidth }).forEach(([k, v]) => rect.setAttribute(k, v));
    pill.style.transformOrigin = `${mx}px ${my}px`;
    pill.style.display = text.textContent ? '' : 'none';
  };

  const setText = (value) => {
    text.textContent = value;
    layout();
  };
  setText(label);
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(layout);
  resize?.observe(element);

  const stop = whenVisible(element, () => {
    layout();
    if (reducedMotion) return;
    line.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 900, delay, easing: EASE, fill: 'backwards' });
    [tickA, tickB, pill].forEach((node, i) => node.animate(
      [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }],
      { duration: 380, delay: delay + 500 + i * 60, easing: EASE, fill: 'backwards' },
    ));
  }, { root });

  return {
    setText,
    dispose() {
      stop();
      resize?.disconnect();
    },
  };
}
