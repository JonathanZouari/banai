// One short status line at the bottom of the window (role=status, so screen readers hear it).
export function createToast(node, { durationMs = 2200 } = {}) {
  let timer = 0;
  return (message) => {
    node.textContent = message;
    node.classList.add('is-on');
    clearTimeout(timer);
    timer = setTimeout(() => node.classList.remove('is-on'), durationMs);
  };
}
