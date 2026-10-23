import { test, expect, openDesigner } from './fixtures.js';

// Measuring (ADR-040) with a real mouse: the ruler on, press on a point, drag to another and release. A line with
// its distance stays; near a corner the point snaps to it; Shift keeps the line straight; Escape drops a line
// being drawn; a press while measuring selects nothing and moves nothing; "נקה מדידות" clears them.
const at = (page, p) => page.evaluate((q) => window.__banai.viewer.screenPointOfWorld(q), p);
const lines = (page) => page.evaluate(() => window.__banai.viewer.measurements);

async function measure(page, from, to, { shift = false, release = true } = {}) {
  await page.mouse.move(from.x, from.y);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
  if (release) await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

test.describe('measuring', () => {
  test.beforeEach(async ({ page }) => {
    await openDesigner(page);
    await page.evaluate(() => window.__banai.viewer.setView('front'));
    await page.waitForTimeout(800);
    await page.getByTestId('measure-toggle').click();
    await expect(page.getByTestId('measure-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('measure-hint')).toBeVisible();
  });

  test('a straight line across the doors: about a metre, all width; nothing selected or moved', async ({ page }) => {
    const before = await page.evaluate(() => window.__banai.store.getState());
    const a = await at(page, [500, 1200, 20]);
    const b = await at(page, [1500, 1210, 20]);
    await measure(page, a, b, { shift: true, release: false });
    await expect(page.locator('.measure-label').first()).toContainText('ס״מ');
    await page.mouse.up();
    const [line] = await lines(page);
    expect(Math.abs(line.mm - 1000)).toBeLessThanOrEqual(15);
    expect([line.dy, line.dz]).toEqual([0, 0]); // Shift: width only
    const after = await page.evaluate(() => window.__banai.store.getState());
    expect(after.selection).toBeNull();
    expect(after.design).toEqual(before.design);
    await expect(page.getByTestId('measure-clear')).toBeVisible();
  });

  test('near a corner the point snaps to it: the wardrobe’s width, corner to corner', async ({ page }) => {
    // Press 5 px inside the top corners of the doors: both ends snap to the corners.
    const left = await at(page, [0, 2400, 22]);
    const right = await at(page, [2000, 2400, 22]);
    await measure(page, { x: left.x + 5, y: left.y + 5 }, { x: right.x - 5, y: right.y + 5 });
    const [line] = await lines(page);
    expect(Math.abs(line.mm - 2000)).toBeLessThanOrEqual(6); // the doors' outer corners (a few mm of reveal)
    expect(line.dy).toBeLessThanOrEqual(2);
  });

  test('Escape drops the line being drawn; "נקה מדידות" clears; the ruler turns off with M', async ({ page }) => {
    const a = await at(page, [500, 1000, 20]);
    const b = await at(page, [1200, 1000, 20]);
    await measure(page, a, b, { release: false });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await lines(page)).toEqual([]);
    await measure(page, a, b);
    expect(await lines(page)).toHaveLength(1);
    await page.getByTestId('measure-clear').click();
    expect(await lines(page)).toEqual([]);
    await page.keyboard.press('m');
    await expect(page.getByTestId('measure-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('measure-hint')).toBeHidden();
  });
});
