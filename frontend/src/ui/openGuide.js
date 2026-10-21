// Small popover under the "Tap to open" switch: a one-second looping demo of a door
// opening when clicked. Pure CSS animation (see components.css); no assets needed.
import { el } from '../editor/fields.js';

const AUTO_HIDE_MS = 5000;

export function createOpenGuide(anchor) {
  const demo = el('div', { className: 'open-guide__demo', attrs: { 'aria-hidden': 'true' } }, [
    el('div', { className: 'open-guide__cabinet' }, [
      el('div', { className: 'open-guide__door' }),
      el('div', { className: 'open-guide__drawer' }),
    ]),
    el('div', { className: 'open-guide__cursor' }),
  ]);
  const popover = el('div', { className: 'open-guide', attrs: { role: 'status', hidden: '' } }, [
    demo,
    el('p', { className: 'open-guide__text', text: 'Click a door or drawer in the 3D view to open it. Click again to close.' }),
  ]);
  popover.dataset.testid = 'open-guide';
  anchor.append(popover);

  let timer = 0;
  const hide = () => {
    clearTimeout(timer);
    popover.hidden = true;
  };
  popover.addEventListener('click', (event) => {
    event.preventDefault(); // the popover sits inside the switch's <label>; do not flip the switch
    hide();
  });
  return {
    show() {
      popover.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(hide, AUTO_HIDE_MS);
    },
    hide,
  };
}
