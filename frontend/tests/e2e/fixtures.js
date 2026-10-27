import { test as base, expect } from '@playwright/test';

// Every E2E test fails on uncaught page errors or console errors. A test that provokes an
// expected HTTP error can allow exactly that console line via `test.use({ allowedConsoleErrors })`.
export const test = base.extend({
  allowedConsoleErrors: [[], { option: true }],
  page: async ({ page, allowedConsoleErrors }, use) => {
    const problems = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      // The browser logs every non-2xx response; the agent's handled API errors are expected.
      if (/Failed to load resource: the server responded with a status of (409|429|502|503|504)\b/.test(message.text())) return;
      if (allowedConsoleErrors.some((pattern) => pattern.test(message.text()))) return;
      problems.push(`console: ${message.text()}`);
    });
    await use(page);
    expect(problems, problems.join('\n')).toEqual([]);
  },
});

export { expect };

/** The E2E backend has no OpenAI key: tests that mock the agent also report it as connected. */
export async function mockAgentOnline(page, { storage = true } = {}) {
  await page.route('**/api/health', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { status: 'ok', env: 'e2e', agent: true, storage } }),
  }));
}

export async function openDesigner(page) {
  await page.goto('/');
  // The start screen is modal: choose the basic wardrobe to reach the editor.
  await page.getByTestId('entry-basic').click();
  await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
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

/** Language and units live in the header's settings menu: open it, choose, close it again. */
export async function chooseSetting(page, testId) {
  const panel = page.getByTestId('settings-panel');
  if (!(await panel.isVisible())) await page.getByTestId('settings-menu').click();
  await page.getByTestId(testId).click();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
}

/** Render preview is a header button. */
export async function openRender(page) {
  await page.getByTestId('open-render').click();
}

/** Switch the 3D view to the interior (doors hidden). */
export const showInterior = (page) => page.getByTestId('view-interior').click();
