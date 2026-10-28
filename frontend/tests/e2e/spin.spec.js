import { expect, openDesigner, test } from './fixtures.js';

const cameraAt = (page) => page.evaluate(() => window.__banai.viewer.camera.position.toArray().map((v) => v.toFixed(4)).join());
const spinning = (page) => page.evaluate(() => window.__banai.viewer.isSpinning());
const designState = (page) => page.evaluate(() => {
  const { design, revision } = window.__banai.store.getState();
  return { design, revision };
});

async function settledCamera(page) {
  let previous = null;
  await expect.poll(async () => {
    const now = await cameraAt(page);
    const settled = now === previous;
    previous = now;
    return settled;
  }, { intervals: [200] }).toBe(true);
  return previous;
}

test.describe('360° view', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('turns the camera around the wardrobe without touching the design; Stop goes back', async ({ page }) => {
    const button = page.getByTestId('spin-360');
    const before = await designState(page);
    const start = await settledCamera(page);

    await button.click();
    await expect(button).toHaveText('Stop');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => cameraAt(page)).not.toBe(start);

    await button.click();
    await expect(button).toHaveText('360° view');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(await spinning(page)).toBe(false);
    expect(await settledCamera(page)).toBe(start);
    expect(await designState(page)).toEqual(before);
  });

  test('a full turn ends where it started', async ({ page }) => {
    test.slow();
    const start = await settledCamera(page);
    await page.getByTestId('spin-360').click();
    await expect.poll(() => spinning(page), { timeout: 20_000 }).toBe(false);
    await expect(page.getByTestId('spin-360')).toHaveText('360° view');
    expect(await settledCamera(page)).toBe(start);
  });

  test('dragging the view or pressing Esc stops the turn', async ({ page }) => {
    const button = page.getByTestId('spin-360');
    await button.click();
    await expect.poll(() => spinning(page)).toBe(true);
    const canvas = await page.locator('#viewer canvas').boundingBox();
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width / 2 + 40, canvas.y + canvas.height / 2);
    await page.mouse.up();
    expect(await spinning(page)).toBe(false);
    await expect(button).toHaveText('360° view');

    await button.click();
    await expect.poll(() => spinning(page)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await spinning(page)).toBe(false);
  });
});
