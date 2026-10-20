// Material-style press ripple, delegated from the document so every button gets it.
// Purely decorative: it never changes content or focus, and is removed when it finishes.
const TARGETS = '.btn, .icon-btn, .segmented__option, .suggestion, .swatch, .chat__voice-toggle, .view-switch__btn';

export function installRipple(root = document) {
  root.addEventListener('pointerdown', (event) => {
    const target = event.target.closest?.(TARGETS);
    if (!target || target.disabled) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.setAttribute('aria-hidden', 'true');
    Object.assign(ripple.style, {
      width: `${size}px`,
      height: `${size}px`,
      left: `${event.clientX - rect.left - size / 2}px`,
      top: `${event.clientY - rect.top - size / 2}px`,
    });
    target.append(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  });
}
