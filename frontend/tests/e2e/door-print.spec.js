// Printed image on door fronts: a browser-only preview. The image must never reach the server
// and never change the design.
import { clickComponent, expect, openDesigner, test } from './fixtures.js';

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const printed = (page, id) => page.evaluate((doorId) => {
  const mesh = window.__banai.viewer.meshOf(doorId);
  return Array.isArray(mesh.material) && Boolean(mesh.material[4].map);
}, id);
const state = (page) => page.evaluate(() => {
  const { design, revision, ui } = window.__banai.store.getState();
  return { design, revision, prints: ui.prints };
});
const selectDoor = (page, id) => page.evaluate((doorId) => window.__banai.store.select(doorId), id);

test.describe('printed image on door fronts', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('an uploaded image is shown on the door and never leaves the browser', async ({ page }) => {
    const sent = [];
    page.on('request', (request) => { if (request.method() !== 'GET') sent.push(`${request.method()} ${request.url()}`); });
    const before = await state(page);
    await selectDoor(page, 'dr_left');
    await expect(page.getByText('Preview only: the image stays in your browser.', { exact: false })).toBeVisible();
    await page.getByTestId('print-upload').setInputFiles({ name: 'beach.png', mimeType: 'image/png', buffer: PNG_1x1 });
    await expect.poll(() => printed(page, 'dr_left')).toBe(true);
    await expect(page.getByText('On this door: beach.png')).toBeVisible();
    expect(await printed(page, 'dr_middle')).toBe(false);

    const after = await state(page);
    expect(after.design).toEqual(before.design);
    expect(after.revision).toBe(before.revision);
    expect(sent).toEqual([]);

    await page.getByTestId('print-remove').click();
    await expect.poll(() => printed(page, 'dr_left')).toBe(false);
  });

  test('a sample print can be applied to all doors', async ({ page }) => {
    await selectDoor(page, 'dr_middle');
    await page.getByTestId('print-sample-dunes').click();
    await expect.poll(() => printed(page, 'dr_middle')).toBe(true);
    await page.getByTestId('print-apply-all').click();
    for (const id of ['dr_left', 'dr_middle', 'dr_right']) {
      await expect.poll(() => printed(page, id)).toBe(true);
    }
  });

  test('files that are not PNG, JPEG or WebP are refused', async ({ page }) => {
    await selectDoor(page, 'dr_left');
    await page.getByTestId('print-upload').setInputFiles({ name: 'evil.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg onload="alert(1)"/>') });
    await expect(page.getByText('Choose a PNG, JPEG or WebP image.')).toBeVisible();
    expect(await printed(page, 'dr_left')).toBe(false);
    expect((await state(page)).prints).toEqual({});
  });

  test('with a print and the doors open, a shelf can still be picked', async ({ page }) => {
    await selectDoor(page, 'dr_left');
    await page.getByTestId('print-sample-forest').click();
    await expect.poll(() => printed(page, 'dr_left')).toBe(true);
    await page.getByTestId('toggle-doors-open').check();
    await page.waitForFunction(() => window.__banai.viewer.doorOpenAmount() === 1);
    await clickComponent(page, 'shf_l2');
    await expect.poll(() => page.evaluate(() => window.__banai.store.getState().selection?.id)).toBe('shf_l2');
    expect(await printed(page, 'dr_left')).toBe(true);
  });
});
