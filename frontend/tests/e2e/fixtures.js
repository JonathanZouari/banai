import { test as base, expect } from '@playwright/test';

// Every E2E test fails on uncaught page errors or console errors. A test that expects a refused request
// (the browser logs it as a console error) names it with allowConsoleErrors(/pattern/).
export const test = base.extend({
  allowedConsoleErrors: async ({}, use) => use([]),
  allowConsoleErrors: async ({ allowedConsoleErrors }, use) => use((pattern) => allowedConsoleErrors.push(pattern)),
  page: async ({ page, allowedConsoleErrors }, use) => {
    const problems = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (allowedConsoleErrors.some((pattern) => pattern.test(message.text()))) return;
      problems.push(`console: ${message.text()}`);
    });
    await use(page);
    expect(problems, problems.join('\n')).toEqual([]);
  },
});

export { expect };

export async function openDesigner(page, { advice = false } = {}) {
  await page.goto('/');
  // The start screen is modal: choose the basic wardrobe to reach the editor.
  await page.getByTestId('entry-basic').click();
  await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
  if (advice) await openAdvice(page);
}

/** The advice opens from the Help menu as a panel over the 3D view. */
export async function openAdvice(page) {
  if (await page.getByTestId('advice-panel').isVisible()) return;
  await page.getByTestId('menu-help-button').click();
  await page.getByTestId('tab-advice').click();
  await expect(page.getByTestId('advice-panel')).toBeVisible();
}

/** Opens, by clicking their summaries as a user would, the menus above a control in the top menu bar. */
export async function reveal(page, testId) {
  const closed = await page.evaluate((id) => {
    const target = document.querySelector(`[data-testid="${id}"]`);
    // A summary's own <details> is what a click on it opens: only the menus above that one are opened here.
    const all = [...document.querySelectorAll('details')];
    const found = [];
    for (let node = target?.tagName === 'SUMMARY' ? target.parentElement?.parentElement : target?.parentElement; node; node = node.parentElement) {
      if (node.tagName === 'DETAILS' && !node.open) found.unshift(all.indexOf(node));
    }
    return found;
  }, testId);
  for (const index of closed) await page.locator('details').nth(index).locator(':scope > summary').click();
}

/** The chat is always in the side column. */
export async function openChat(page) {
  await expect(page.getByTestId('chat-input')).toBeVisible();
}

export const selection = (page) => page.evaluate(() => window.__banai.store.getState().selection);

export async function clickComponent(page, componentId) {
  await page.waitForFunction(() => {
    const { camera } = window.__banai.viewer;
    const key = camera.position.toArray().map((v) => v.toFixed(5)).join();
    const settled = window.__lastCameraKey === key;
    window.__lastCameraKey = key;
    return settled;
  }, null, { polling: 100 });
  const point = await page.evaluate((id) => window.__banai.viewer.screenPointOf(id), componentId);
  await page.mouse.click(point.x, point.y);
}

/** Share of canvas pixels that differ from the background colour. */
export const paintedRatio = (page) => page.evaluate(() => {
  const source = document.querySelector('#viewer canvas');
  const copy = document.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  const context = copy.getContext('2d');
  context.drawImage(source, 0, 0);
  const { data } = context.getImageData(0, 0, copy.width, copy.height);
  let painted = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i] - 236) + Math.abs(data[i + 1] - 238) + Math.abs(data[i + 2] - 236) > 12) painted += 1;
  }
  return painted / (data.length / 4);
});
