// The top menu bar (File, Tools, Settings, Help, About). Menus are <details> with a popover, as the "controls"
// card is. This only adds what <details> lacks: one menu open at a time, a press outside or a chosen item
// closes it, items that mirror a button elsewhere (save, undo, redo), and a busy state shown on the closed menu.

/** A menu item that is another control's twin: it clicks it and follows its disabled state. */
function bindMirrors(root) {
  root.querySelectorAll('[data-mirror]').forEach((proxy) => {
    const target = document.getElementById(proxy.dataset.mirror);
    if (!target) return;
    proxy.addEventListener('click', () => target.click());
    const sync = () => { proxy.disabled = target.disabled; };
    new MutationObserver(sync).observe(target, { attributes: true, attributeFilter: ['disabled'] });
    sync();
  });
}

/**
 * A long job (a video, the dossier) shows its progress on its own summary inside the menu, which is closed
 * while it runs. The menu's summary shows the same text, and a press on it goes to the job (a video cancels).
 */
function bindBusy(menu) {
  const summary = menu.querySelector(':scope > summary');
  const label = summary.textContent;
  menu.querySelectorAll('.menubar__popover details > summary').forEach((inner) => {
    const reflect = () => {
      const busy = inner.getAttribute('aria-busy') === 'true';
      menu.toggleAttribute('aria-busy', busy);
      summary.textContent = busy ? inner.textContent : label;
    };
    new MutationObserver(reflect).observe(inner, { attributes: true, attributeFilter: ['aria-busy'], childList: true, characterData: true, subtree: true });
    summary.addEventListener('click', (event) => {
      if (inner.getAttribute('aria-busy') !== 'true') return;
      event.preventDefault();
      inner.click();
    });
  });
}

export function bindMenubar(root = document) {
  const menus = [...root.querySelectorAll('.menubar-menu')];
  menus.forEach((menu) => {
    menu.addEventListener('toggle', () => {
      if (menu.open) menus.forEach((other) => { if (other !== menu) other.open = false; });
    });
    menu.querySelector('.menubar__popover').addEventListener('click', (event) => {
      if (event.target.closest('.menu-item, .menu-option, a[href]')) menu.open = false;
    });
    bindBusy(menu);
  });
  // Any press outside closes every open menu card, the menus and the "controls" card alike.
  document.addEventListener('pointerdown', (event) => {
    document.querySelectorAll('details.help[open]').forEach((menu) => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  });
  bindMirrors(root);
}
