// Small popover anchored to a trigger button: the header's overflow (kebab) menu and settings menu.
// Opens below the trigger, aligned to its end edge (so it also works right-to-left). Closes on Esc,
// a click outside, or after a menu item is chosen. Text only: never uses innerHTML.

/**
 * Wire `trigger` to show `panel`. `role` is 'menu' (a list of actions; focus moves to the first item and
 * arrow keys move between items) or 'dialog' (free content, like segmented controls).
 * Returns { open, close, isOpen }.
 */
export function attachPopover(trigger, panel, { role = 'menu', label = '' } = {}) {
  const host = trigger.parentElement;
  host.classList.add('popover-host');
  panel.classList.add('popover');
  panel.setAttribute('role', role);
  if (label) panel.setAttribute('aria-label', label);
  if (!panel.id) panel.id = `popover-${Math.random().toString(36).slice(2, 10)}`;
  panel.hidden = true;
  trigger.setAttribute('aria-haspopup', role === 'menu' ? 'menu' : 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panel.id);
  if (panel.parentElement !== host) host.append(panel);

  const items = () => [...panel.querySelectorAll('[role="menuitem"]:not([disabled])')];
  const focusables = () => [...panel.querySelectorAll('button:not([disabled]), input, select, [tabindex="0"]')];

  const onDocumentPointer = (event) => {
    if (!panel.contains(event.target) && !trigger.contains(event.target)) close();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      trigger.focus();
      return;
    }
    if (role !== 'menu' || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const list = items();
    if (list.length === 0) return;
    event.preventDefault();
    const index = list.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? list.length - 1
        : event.key === 'ArrowDown' ? (index + 1) % list.length
          : (index - 1 + list.length) % list.length;
    list[next].focus();
  };

  function open() {
    if (!panel.hidden) return;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onDocumentPointer, true);
    panel.addEventListener('keydown', onKey);
    (role === 'menu' ? items()[0] : focusables()[0])?.focus();
  }

  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDocumentPointer, true);
    panel.removeEventListener('keydown', onKey);
  }

  trigger.addEventListener('click', () => (panel.hidden ? open() : close()));
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowDown' && role === 'menu') { event.preventDefault(); open(); }
  });
  // Choosing an action closes the menu (the action itself runs from its own click handler).
  panel.addEventListener('click', (event) => {
    if (role === 'menu' && event.target.closest('[role="menuitem"]')) close();
  });

  return { open, close, isOpen: () => !panel.hidden };
}
