// Camera angle buttons over the 3D view: front, side, 3/4 and reset. They only move the camera
// (viewer.setView); the design state is never touched.

// The labels follow the customer's wording; the rest of the viewer chrome is English.
export const VIEW_BUTTONS = Object.freeze([
  { view: 'front', label: 'חזית' },
  { view: 'side', label: 'צד' },
  { view: 'threeQuarter', label: '3/4' },
  { view: 'reset', label: 'איפוס' },
]);

export function mountViewButtons(container, viewer) {
  const bar = document.createElement('div');
  bar.className = 'view-buttons';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'זווית מצלמה');
  bar.lang = 'he';
  bar.dir = 'rtl';
  bar.dataset.testid = 'view-buttons';

  const buttons = VIEW_BUTTONS.map(({ view, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--tonal view-buttons__button';
    button.textContent = label;
    button.dataset.testid = `view-${view}`;
    // Reset is an action; the three angles show which one the camera is on.
    if (view !== 'reset') button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      viewer.setView(view);
      setPressed(view === 'reset' ? null : view);
    });
    return button;
  });

  const setPressed = (active) => {
    buttons.forEach((button) => {
      if (button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', String(button.dataset.testid === `view-${active}`));
    });
  };
  // Orbiting by hand leaves the preset angle.
  const clear = () => setPressed(null);
  viewer.controls.addEventListener('start', clear);

  bar.append(...buttons);
  container.append(bar);
  return () => {
    viewer.controls.removeEventListener('start', clear);
    bar.remove();
  };
}
