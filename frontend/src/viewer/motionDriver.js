// Springs for everything that moves in the live view. Node-safe (no DOM, no WebGL): the viewer feeds
// it the store state and the frame time, and poses the scene from its values.
// Every door shares one openness; every pull-out (drawer, trouser rack, pull-down rail) has its own,
// each on a critically damped spring. The springs are sequenced: pull-outs behind doors wait until
// the doors are OPEN_GATE open, and closing doors wait until those pull-outs are back in to
// CLOSE_GATE, so the doors lead on the way out and follow on the way in, overlapping slightly.
// pin(t) holds every part on the deterministic open sequence instead (motion.js sequencePose), until
// release() hands control back to the store.
import { motionTargets, sequencePose } from './motion.js';

/** Spring response time (s) per category: the heavier the part, the slower it moves. */
export const RESPONSE_S = Object.freeze({ doors: 0.35, drawers: 0.45, trousers: 0.5, pulldown: 0.7 });
export const OPEN_GATE = 0.7;
export const CLOSE_GATE = 0.15;
const MAX_DT = 0.1; // s: a long frame (or a background tab) never jumps the springs
const SETTLE_VALUE = 5e-4;
const SETTLE_VELOCITY = 5e-3;

const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** One step of a critically damped spring toward `target`: [value, velocity], snapped once settled. */
export function springStep(value, velocity, target, response, dt) {
  const omega = (2 * Math.PI) / response;
  const e0 = value - target;
  const c = velocity + omega * e0;
  const decay = Math.exp(-omega * dt);
  const next = target + (e0 + c * dt) * decay;
  const nextVelocity = (velocity - omega * c * dt) * decay;
  if (Math.abs(next - target) < SETTLE_VALUE && Math.abs(nextVelocity) < SETTLE_VELOCITY) return [target, 0];
  return [next, nextVelocity];
}

export function createMotionDriver() {
  let access = new Map(); // pull-out id -> { category, covered, reachable, yields } (motion.js)
  let hasDoors = false;
  let inputs = { doorsOpen: false, selectedId: null };
  let pinned = null; // { t, immediate } while the open sequence holds the parts
  const doors = { value: 0, velocity: 0 };
  const parts = new Map(); // id -> { value, velocity, category }

  /** Where everything comes to rest: { doors, parts: Map(id -> openness) }. */
  const goal = () => (pinned
    ? sequencePose(access, pinned.t, { hasDoors })
    : motionTargets(access, { ...inputs, hasDoors }));

  // The springs' targets now: the goal, held back by the gates (the pinned sequence orders itself).
  const gated = (final) => {
    if (pinned) return final;
    const single = inputs.selectedId !== null && access.has(inputs.selectedId);
    const waits = (id) => hasDoors && (!single || access.get(id).covered);
    const targets = new Map([...final.parts].map(([id, target]) =>
      [id, target > 0 && waits(id) && doors.value < OPEN_GATE ? 0 : target]));
    const holding = hasDoors && final.doors < doors.value
      && [...parts].some(([id, state]) => access.get(id).covered && state.value > CLOSE_GATE);
    return { doors: holding ? doors.value : final.doors, parts: targets };
  };

  const jump = (final) => {
    let changed = false;
    const set = (state, target) => {
      if (state.value === target && state.velocity === 0) return;
      state.value = target;
      state.velocity = 0;
      changed = true;
    };
    set(doors, final.doors);
    parts.forEach((state, id) => set(state, final.parts.get(id) ?? 0));
    return changed;
  };

  const restsAt = (state, target) => state.value === target && state.velocity === 0;

  return {
    /** After a rebuild: the pull-outs now in the scene. Parts that persist keep their openness. */
    configure(nextAccess, { hasDoors: doorsInScene = false } = {}) {
      access = nextAccess;
      hasDoors = Boolean(doorsInScene);
      [...parts.keys()].forEach((id) => { if (!access.has(id)) parts.delete(id); });
      access.forEach((part, id) => {
        if (parts.has(id)) parts.get(id).category = part.category;
        else parts.set(id, { value: 0, velocity: 0, category: part.category });
      });
      if (pinned?.immediate) jump(goal());
    },

    /** The store state the parts follow: { doorsOpen, selectedId }. */
    setInputs({ doorsOpen = false, selectedId = null } = {}) {
      inputs = { doorsOpen: Boolean(doorsOpen), selectedId: selectedId ?? null };
    },

    /** Hold every part at time t of the open sequence; immediate poses it now, else the springs go there. */
    pin(t, { immediate = true } = {}) {
      pinned = { t: clamp01(t), immediate: Boolean(immediate) };
      if (pinned.immediate) jump(goal());
      return goal();
    },

    /** Hand the parts back to the store state; they spring back from where they are. */
    release() {
      pinned = null;
    },

    get pinned() { return pinned !== null; },

    /** Advance the springs by dt seconds; with reduced motion jump to the end state. Returns whether anything moved. */
    step(dt, { reducedMotion = false } = {}) {
      if (pinned?.immediate) return false;
      const final = goal();
      if (reducedMotion) return jump(final);
      const targets = gated(final);
      const time = Math.min(Math.max(Number.isFinite(dt) ? dt : 0, 0), MAX_DT);
      let changed = false;
      const advance = (state, target, response) => {
        if (restsAt(state, target)) return;
        [state.value, state.velocity] = springStep(state.value, state.velocity, target, response, time);
        changed = true;
      };
      advance(doors, targets.doors, RESPONSE_S.doors);
      parts.forEach((state, id) => advance(state, targets.parts.get(id) ?? 0, RESPONSE_S[state.category] ?? RESPONSE_S.drawers));
      return changed;
    },

    /** Jump to the end state (the path tracer bakes a still scene). Returns whether anything moved. */
    snap: () => jump(goal()),

    /** Whether every part rests where the store (or the pinned sequence) wants it. */
    get settled() {
      const final = goal();
      return restsAt(doors, final.doors) && [...parts].every(([id, state]) => restsAt(state, final.parts.get(id) ?? 0));
    },

    /** Door openness 0..1. */
    get doors() { return doors.value; },

    /** Openness 0..1 of a pull-out (0 for anything else). */
    opennessOf: (id) => parts.get(id)?.value ?? 0,

    /** { id: openness } of every pull-out. */
    pullOuts: () => Object.fromEntries([...parts].map(([id, state]) => [id, state.value])),
  };
}
