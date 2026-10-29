// The landing page above the start screen's ways in: three motion sections sharing one frame
// loop. Each section renders only while on screen; everything is torn down when the start
// screen closes, so the editor never pays for it.
import { damp } from './motion.js';
import { createInside } from './inside.js';
import { createStory } from './story.js';
import { createStudio } from './studio.js';
import { showcaseDesign } from './wardrobe.js';

const MAX_STEP = 0.05; // seconds; a long pause (hidden tab) must not jump the damping

export function createLanding({ catalog, onStart, onBuild }) {
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => motionQuery.matches;
  const design = showcaseDesign(catalog);
  const makers = [
    () => createStory({ design, catalog, reducedMotion, onStart }),
    () => createInside({ design, catalog, reducedMotion }),
    () => createStudio({ catalog, reducedMotion, onBuild }),
  ];
  const sections = [];
  try {
    makers.forEach((make) => sections.push(make()));
  } catch (error) {
    sections.forEach((s) => s.dispose()); // no half-built landing keeps timers or WebGL contexts
    throw error;
  }

  const pointer = { x: 0, y: 0, goalX: 0, goalY: 0 };
  const onPointer = (event) => {
    pointer.goalX = event.clientX / window.innerWidth - 0.5;
    pointer.goalY = event.clientY / window.innerHeight - 0.5;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  let frame = 0;
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(MAX_STEP, Math.max(0, (now - last) / 1000));
    last = now;
    const still = reducedMotion();
    pointer.x = still ? 0 : damp(pointer.x, pointer.goalX, 3, dt);
    pointer.y = still ? 0 : damp(pointer.y, pointer.goalY, 3, dt);
    frame = requestAnimationFrame(tick); // scheduled first: one failing section must not freeze the rest
    sections.forEach((section) => {
      try {
        section.update(dt, now, pointer);
      } catch {
        // a decorative scene failed this frame; the ways in below keep working
      }
    });
  };
  frame = requestAnimationFrame(tick);

  return {
    nodes: sections.map((s) => s.node),
    relabel() { sections.forEach((s) => s.relabel()); },
    dispose() {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointer);
      sections.forEach((s) => s.dispose());
    },
  };
}
