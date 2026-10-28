import { expect, openDesigner, test } from './fixtures.js';

const tooltip = (page) => page.locator('.hover-tooltip');
const state = (page) => page.evaluate(() => {
  const { design, revision, selection } = window.__banai.store.getState();
  return JSON.stringify({ design, revision, selection });
});
const showInterior = (page) => page.evaluate(() => window.__banai.store.setDoorsVisible(false));
// Move the mouse onto a component's centre (client coordinates from the viewer helper).
async function hover(page, id) {
  const point = await page.evaluate((componentId) => window.__banai.viewer.screenPointOf(componentId), id);
  await page.mouse.move(point.x - 3, point.y - 3);
  await page.mouse.move(point.x, point.y);
  return point;
}

// A compartment has no mesh of its own (its back panel is part of the carcass), so aim at the back of
// the middle compartment: x 1.0 m (centre of 679-1322 mm), y 1.0 m, z just in front of the back panel.
async function hoverMiddleCompartment(page) {
  const point = await page.evaluate(() => {
    const { camera, canvas } = window.__banai.viewer;
    camera.updateMatrixWorld();
    const projected = camera.position.clone().set(1.0, 1.0, -0.585).project(camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + ((projected.x + 1) / 2) * rect.width, y: rect.top + ((1 - projected.y) / 2) * rect.height };
  });
  await page.mouse.move(point.x - 3, point.y - 3);
  await page.mouse.move(point.x, point.y);
}

test.describe('hover tooltip in the 3D view', () => {
  test.beforeEach(async ({ page }) => {
    await openDesigner(page);
    await showInterior(page);
    await page.waitForTimeout(300);
  });

  test('a shelf shows its height from the base, in Hebrew by default', async ({ page }) => {
    await hover(page, 'shf_l2');
    await expect(tooltip(page)).toBeVisible();
    await expect(tooltip(page)).toHaveText('מדף · גובה 80 ס"מ');
    await expect(tooltip(page)).toHaveAttribute('role', 'tooltip');
  });

  test('a drawer and a compartment show their labels', async ({ page }) => {
    await hover(page, 'drw_r1');
    await expect(tooltip(page)).toHaveText('מגירה · גובה 20 ס"מ');
    await hoverMiddleCompartment(page);
    await expect(tooltip(page)).toHaveText('תא 2 · רוחב 64.3 ס"מ');
  });

  test('it hides when the pointer leaves the component, leaves the canvas, or presses', async ({ page }) => {
    const point = await hover(page, 'shf_l2');
    await expect(tooltip(page)).toBeVisible();
    await page.mouse.move(2, 2); // outside the viewer entirely
    await expect(tooltip(page)).toBeHidden();

    await hover(page, 'shf_l2');
    await expect(tooltip(page)).toBeVisible();
    await page.mouse.down(); // starts a click or an orbit
    await expect(tooltip(page)).toBeHidden();
    await page.mouse.up();
    expect(point).toBeTruthy();
  });

  test('the wording follows the chat language', async ({ page }) => {
    await page.getByTestId('chat-language-en').click();
    await hover(page, 'shf_l2');
    await expect(tooltip(page)).toHaveText('Shelf · height 80 cm');
    await hover(page, 'drw_r1');
    await expect(tooltip(page)).toHaveText('Drawer · height 20 cm');
  });

  test('hovering changes nothing: no selection, no revision, no design change', async ({ page }) => {
    const before = await state(page);
    for (const id of ['shf_l2', 'drw_r1', 'shf_m1']) {
      await hover(page, id);
      await page.waitForTimeout(80);
    }
    await hoverMiddleCompartment(page);
    await page.waitForTimeout(80);
    expect(await state(page)).toBe(before);
  });

  test('it never blocks clicks: the click goes through and selects the shelf', async ({ page }) => {
    await hover(page, 'shf_l2');
    await expect(tooltip(page)).toBeVisible();
    await expect(tooltip(page)).toHaveCSS('pointer-events', 'none');
    const point = await page.evaluate(() => window.__banai.viewer.screenPointOf('shf_l2'));
    await page.mouse.click(point.x, point.y);
    expect(await page.evaluate(() => window.__banai.store.getState().selection?.id)).toBe('shf_l2');
    await expect(tooltip(page)).toBeHidden(); // the press hid it, and selection rebuilt the view
  });

  test('it stays inside the viewer, even near the right edge', async ({ page }) => {
    const box = await page.locator('#viewer').boundingBox();
    await hover(page, 'shf_r1'); // the rightmost compartment
    const tip = await tooltip(page).boundingBox();
    expect(tip.x).toBeGreaterThanOrEqual(box.x);
    expect(tip.x + tip.width).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(tip.y).toBeGreaterThanOrEqual(box.y);
    expect(tip.y + tip.height).toBeLessThanOrEqual(box.y + box.height + 1);
  });

  test('a door has no tooltip', async ({ page }) => {
    await page.evaluate(() => window.__banai.store.setDoorsVisible(true));
    await page.waitForTimeout(300);
    const point = await page.evaluate(() => window.__banai.viewer.screenPointOf(window.__banai.store.getState().design.doors.items[0].id));
    await page.mouse.move(point.x - 3, point.y - 3);
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(150);
    await expect(tooltip(page)).toBeHidden();
  });
});
