// Dimension indicators: overall W/H/D lines with labels, plus a label for the selected
// component. Labels are CSS2D DOM nodes written with textContent only (never HTML).
//
// Each label sits in a `.dim-label-group` ([-] label [+]) whose [-]/[+] buttons are the on-canvas
// steppers: click = 10 mm, Shift+click = 100 mm, press-and-hold repeats. The buttons never touch
// the design; they only call `onStep({ target, field, deltaMm })`.
//
// The label groups are created once and updated in place (text, position, disabled state), never
// rebuilt on a design change. `update()` runs on every step, so rebuilding would destroy the
// button under the pointer: a held press would lose its pointer events and keyboard focus would
// drop after every Enter. The selected item's group is kept while the same component stays
// selected and is replaced (stopping any hold on it) when the selection changes.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LIMITS } from '../domain/defaults.js';
import { cm, describeSelection } from './format.js';
import { STEP_MM, canStep, repeatDelay, stepDelta } from './steppers.js';
import { toM } from './units.js';

const OFFSET = 80; // mm, distance of dimension lines from the carcass (visual only)

const WARDROBE_LABELS = Object.freeze([
  {
    field: 'width', minus: 'Narrow the wardrobe', plus: 'Widen the wardrobe',
    text: ({ width }) => `W ${cm(width)} cm`,
    anchor: ({ width, height }) => [width / 2, height + OFFSET, 0],
  },
  {
    field: 'height', minus: 'Lower the wardrobe', plus: 'Raise the wardrobe',
    text: ({ height }) => `H ${cm(height)} cm`,
    anchor: ({ height }) => [-OFFSET, height / 2, 0],
  },
  {
    field: 'depth', minus: 'Make the wardrobe shallower', plus: 'Make the wardrobe deeper',
    text: ({ depth }) => `D ${cm(depth)} cm`,
    anchor: ({ width, depth }) => [width + OFFSET, 0, -depth / 2],
  },
]);

/** Stepper wiring of the selected component, or null when its kind has no steppers. */
function selectedStepper({ kind }) {
  if (kind === 'shelf' || kind === 'drawer' || kind === 'rail') {
    return { field: 'y', minus: `Move ${kind} down`, plus: `Move ${kind} up` };
  }
  if (kind === 'compartment') return { field: 'width', minus: 'Narrow the compartment', plus: 'Widen the compartment' };
  return null;
}

/**
 * Press-and-hold engine plus the factory for label groups. All listeners are bound once per
 * element (and a few on window) and removed together by `dispose()`.
 */
function createSteppers(onStep) {
  const abort = new AbortController();
  const { signal } = abort;
  let hold = null; // { entry, pointerId, shiftKey, count, timer }

  const step = (entry, shiftKey) => onStep?.({ target: entry.target, field: entry.field, deltaMm: entry.sign * stepDelta(shiftKey) });

  const stop = () => {
    if (!hold) return;
    clearTimeout(hold.timer);
    hold = null;
  };

  const tick = () => {
    const current = hold;
    if (!current) return;
    const { entry } = current;
    if (entry.button.disabled || !entry.button.isConnected) {
      stop();
      return;
    }
    if (current.count === 0) {
      // The camera refits after every step, so the label can slide out from under a still pointer:
      // capture it for the rest of the hold. The click that ends this press must not step again.
      try { entry.button.setPointerCapture(current.pointerId); } catch { /* the pointer is already gone */ }
      entry.swallowClick = true;
    }
    current.count += 1;
    const result = step(entry, current.shiftKey);
    if (hold !== current) return; // the step itself ended the hold (e.g. it disabled the button)
    if (result?.ok === false) {
      stop(); // a rejected move (limit reached) will not succeed by repeating it
      return;
    }
    current.timer = setTimeout(tick, repeatDelay(current.count));
  };

  const start = (entry, event) => {
    stop();
    hold = { entry, pointerId: event.pointerId, shiftKey: event.shiftKey, count: 0, timer: 0 };
    hold.timer = setTimeout(tick, repeatDelay(0));
  };

  // Releasing anywhere (even if the button was removed or the pointer left the window) ends the hold.
  const onRelease = (event) => { if (hold && event.pointerId === hold.pointerId) stop(); };
  window.addEventListener('pointerup', onRelease, { capture: true, signal });
  window.addEventListener('pointercancel', onRelease, { capture: true, signal });
  window.addEventListener('blur', (event) => { if (event.target === window) stop(); }, { signal });

  const createButton = (sign, target, field, ariaLabel, testId) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `dim-step dim-step--${sign < 0 ? 'minus' : 'plus'}`;
    button.setAttribute('aria-label', ariaLabel);
    button.setAttribute('data-testid', testId);
    button.style.pointerEvents = 'auto'; // the label overlay itself is pointer-events: none
    button.style.touchAction = 'none'; // a touch hold must not turn into a page pan (pointercancel)
    const entry = { button, sign, target, field, swallowClick: false };

    button.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      entry.swallowClick = false;
      if (event.button === 0 && event.isPrimary !== false && !button.disabled) start(entry, event);
    }, { signal });
    button.addEventListener('pointerup', (event) => event.stopPropagation(), { signal });
    // Without pointer capture (before the first repeat) leaving the button cancels the press.
    button.addEventListener('pointerleave', () => { if (hold?.entry === entry) stop(); }, { signal });
    button.addEventListener('lostpointercapture', () => { if (hold?.entry === entry) stop(); }, { signal });
    button.addEventListener('blur', () => { if (hold?.entry === entry) stop(); }, { signal });
    button.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
    button.addEventListener('keydown', (event) => {
      // Enter/Space activate once through the native click; holding the key does not repeat.
      if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    }, { signal });
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const followsHold = entry.swallowClick && event.detail > 0; // keyboard clicks have detail 0
      entry.swallowClick = false;
      if (followsHold || button.disabled) return;
      step(entry, event.shiftKey);
    }, { signal });
    return entry;
  };

  return {
    /**
     * A `.dim-label-group` around a `.dim-label` element holding only `text`. With `stepper`
     * ({ target, field, minus, plus, testId }) it also gets the [-] and [+] buttons.
     */
    createGroup(labelClass, text, stepper) {
      const element = document.createElement('div');
      element.className = 'dim-label-group';
      const label = document.createElement('div');
      label.className = labelClass;
      label.textContent = text;
      const group = { object: new CSS2DObject(element), label, minus: null, plus: null };
      if (stepper) {
        const { target, field, testId } = stepper;
        group.minus = createButton(-1, target, field, stepper.minus, `step-${testId}-minus`);
        group.plus = createButton(1, target, field, stepper.plus, `step-${testId}-plus`);
        element.append(group.minus.button, label, group.plus.button);
      } else {
        element.append(label);
      }
      return group;
    },
    setDisabled(entry, disabled) {
      entry.button.disabled = disabled;
      if (disabled && hold?.entry === entry) stop();
    },
    /** Ends a hold that belongs to a group that is about to be removed. */
    release(group) {
      if (hold && (hold.entry === group.minus || hold.entry === group.plus)) stop();
    },
    dispose() {
      stop();
      abort.abort();
    },
  };
}

export function createDimensions(scene, { onStep } = {}) {
  const layer = new THREE.Group();
  layer.name = 'dimensions';
  scene.add(layer);
  const lines = new THREE.Group();
  layer.add(lines);
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#5b6470', toneMapped: false });
  const steppers = createSteppers(onStep);
  let wardrobe = null; // one persistent group per overall dimension, created on the first update
  let selected = null; // { key, group }

  const line = (from, to) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to].map(([x, y, z]) => new THREE.Vector3(toM(x), toM(y), toM(z))));
    lines.add(new THREE.Line(geometry, lineMaterial));
  };

  const setText = (element, text) => { if (element.textContent !== text) element.textContent = text; };
  const place = (object, [x, y, z]) => object.position.set(toM(x), toM(y), toM(z));

  const clearLines = () => {
    lines.children.forEach((child) => child.geometry?.dispose());
    lines.clear();
  };

  const removeSelected = () => {
    if (!selected) return;
    steppers.release(selected.group);
    layer.remove(selected.group.object); // the CSS2D 'removed' handler detaches its DOM element
    selected = null;
  };

  const updateWardrobe = (dimensions) => {
    wardrobe ??= WARDROBE_LABELS.map((spec) => {
      const group = steppers.createGroup('dim-label', spec.text(dimensions), {
        target: 'wardrobe', field: spec.field, minus: spec.minus, plus: spec.plus, testId: spec.field,
      });
      layer.add(group.object);
      return group;
    });
    WARDROBE_LABELS.forEach((spec, index) => {
      const group = wardrobe[index];
      setText(group.label, spec.text(dimensions));
      place(group.object, spec.anchor(dimensions));
      steppers.setDisabled(group.minus, !canStep(dimensions[spec.field], -STEP_MM, LIMITS[spec.field]));
      steppers.setDisabled(group.plus, !canStep(dimensions[spec.field], STEP_MM, LIMITS[spec.field]));
    });
  };

  const updateSelected = (group, design, selection) => {
    if (!selection || !group) {
      removeSelected();
      return;
    }
    const key = `${selection.kind}:${selection.id}`;
    if (selected && selected.key !== key) removeSelected();
    const text = describeSelection(design, selection);
    if (!selected) {
      const wiring = selectedStepper(selection);
      const created = steppers.createGroup('dim-label dim-label--selected', text, wiring && { ...wiring, target: selection.id, testId: 'selected' });
      created.object.center.set(0.5, 1.6); // sit above the component instead of covering it
      layer.add(created.object);
      selected = { key, group: created };
    }
    setText(selected.group.label, text);
    const target = group.children.find((mesh) => mesh.userData.componentId === selection.id);
    const { width, height } = design.dimensions;
    selected.group.object.position.copy(target ? target.position : new THREE.Vector3(toM(width / 2), toM(height / 2), 0));
  };

  return {
    update(group, design, selection) {
      clearLines();
      const dimensions = design.dimensions;
      const { width: w, height: h, depth: d } = dimensions;
      line([0, h + OFFSET, 0], [w, h + OFFSET, 0]);
      line([-OFFSET, 0, 0], [-OFFSET, h, 0]);
      line([w + OFFSET, 0, 0], [w + OFFSET, 0, -d]);
      updateWardrobe(dimensions);
      updateSelected(group, design, selection);
    },
    dispose() {
      steppers.dispose();
      removeSelected();
      wardrobe?.forEach((entry) => layer.remove(entry.object));
      wardrobe = null;
      clearLines();
      scene.remove(layer);
      lineMaterial.dispose();
    },
  };
}
