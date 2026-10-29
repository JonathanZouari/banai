import { describe, expect, it } from 'vitest';
import { createRouter } from '../../../src/app/router.js';

/** A fake window.history + popstate target that behaves like the browser's. */
function fakeBrowser(initialState = null) {
  const entries = [initialState];
  let index = 0;
  const listeners = [];
  const history = {
    get state() { return entries[index]; },
    replaceState: (state) => { entries[index] = state; },
    pushState: (state) => { entries.splice(index + 1); entries.push(state); index += 1; },
  };
  const target = { addEventListener: (type, fn) => { if (type === 'popstate') listeners.push(fn); } };
  const move = (step) => { index += step; listeners.forEach((fn) => fn({ state: entries[index] })); };
  return { history, target, back: () => move(-1), forward: () => move(1), entries: () => entries };
}

describe('router', () => {
  it('shows the initial view once and records it in history.state', () => {
    const browser = fakeBrowser();
    const shown = [];
    const router = createRouter({ initial: 'home', onShow: (view, info) => shown.push([view, info]), ...browser });
    expect(shown).toEqual([['home', { initial: true }]]);
    expect(router.current()).toBe('home');
    expect(browser.history.state).toEqual({ view: 'home' });
  });

  it('keeps whatever else the current history entry holds', () => {
    const browser = fakeBrowser({ other: 1 });
    createRouter({ initial: 'designer', onShow: () => {}, ...browser });
    expect(browser.history.state).toEqual({ other: 1, view: 'designer' });
  });

  it('go() pushes a new entry; Back and Forward move between the views', () => {
    const browser = fakeBrowser();
    const shown = [];
    const router = createRouter({ initial: 'home', onShow: (view) => shown.push(view), ...browser });
    router.go('designer');
    expect(router.current()).toBe('designer');
    expect(browser.entries()).toEqual([{ view: 'home' }, { view: 'designer' }]);
    browser.back();
    expect(router.current()).toBe('home');
    browser.forward();
    expect(router.current()).toBe('designer');
    expect(shown).toEqual(['home', 'designer', 'home', 'designer']);
  });

  it('ignores unknown views, repeats and history entries without a view', () => {
    const browser = fakeBrowser();
    const shown = [];
    const router = createRouter({ initial: 'nope', onShow: (view) => shown.push(view), ...browser });
    expect(router.current()).toBe('home'); // an unknown initial view falls back to home
    router.go('home');
    router.go('admin');
    browser.history.pushState(null); // e.g. an entry written by someone else
    browser.back();
    browser.forward();
    expect(shown).toEqual(['home']);
  });
});
