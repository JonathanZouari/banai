import { test, expect, openDesigner } from './fixtures.js';

// Stretch handles (ADR-039 stage 2) with a real mouse: the wardrobe's edges change its size (the left one also
// moves it along its wall), a drawer's top edge its height, a clicked obstacle's edges its size, and a room
// wall the room's width. A ghost previews the new size; each drop is one undo step.
const state = (page) => page.evaluate(() => window.__banai.store.getState());
const run = (page, ops) => page.evaluate((o) => window.__banai.store.dispatch(o), ops);
const handleAt = (page, key) => page.evaluate((k) => window.__banai.viewer.screenPointOfHandle(k), key);

async function drag(page, from, dx, dy, { release = true } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(from.x + (dx * i) / 8, from.y + (dy * i) / 8);
  if (release) await page.mouse.up();
}

test.describe('stretch handles', () => {
  test.beforeEach(async ({ page }) => {
    await openDesigner(page);
    await run(page, [{ op: 'set_room', shape: { kind: 'rect', width: 4000, depth: 4000 } }]);
    await page.evaluate(() => window.__banai.viewer.setView('front'));
    await page.waitForTimeout(800);
  });

  test('the wardrobe: the right edge widens it with a ghost and a label; the left edge widens it to the left', async ({ page }) => {
    await page.evaluate(() => window.__banai.store.select('dr_middle'));
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.handleKeys)).toContain('wardrobe:right');
    await drag(page, await handleAt(page, 'wardrobe:right'), 60, 0, { release: false });
    await expect(page.getByTestId('drag-label')).toContainText('רוחב');
    expect(await page.evaluate(() => Boolean(window.__banai.viewer.dragging))).toBe(true);
    await page.mouse.up();
    let { design } = await state(page);
    expect(design.dimensions.width).toBeGreaterThan(2000);
    expect(design.room.offset).toBe(1000);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await state(page)).design.dimensions.width).toBe(2000);

    await drag(page, await handleAt(page, 'wardrobe:left'), -60, 0);
    ({ design } = await state(page));
    expect(design.dimensions.width).toBeGreaterThan(2000);
    expect(design.room.offset).toBe(1000 - (design.dimensions.width - 2000)); // its right edge stayed
  });

  test('a drawer grows from its top edge, up to the shelf above', async ({ page }) => {
    await page.evaluate(() => window.__banai.store.select('drw_r2'));
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.settled), { timeout: 5000 }).toBe(true); // it slides out first
    await page.evaluate(() => { // look at the drawer from above the toolbar that floats over the view's bottom
      const v = window.__banai.viewer;
      v.controls.target.set(1.6, 0.35, 0);
      v.camera.position.set(1.6, 0.9, 2.6);
      v.controls.update();
    });
    await page.waitForTimeout(300);
    await drag(page, await handleAt(page, 'item:drw_r2:top'), 0, -400);
    expect((await state(page)).design.compartments[2].drawers[1].height).toBe(600);
  });

  test('a click on an obstacle shows its handles; its right edge widens it', async ({ page }) => {
    await run(page, [{ op: 'set_site', obstacles: [{ type: 'ac', x: -900, y: 1800, width: 600, height: 300 }] }]);
    await page.waitForTimeout(300);
    const at = await page.evaluate(() => window.__banai.viewer.screenPointOfTarget({ kind: 'obstacle', index: 0 }));
    await page.mouse.click(at.x, at.y);
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.handleKeys)).toContain('obstacle:0:right');
    await drag(page, await handleAt(page, 'obstacle:0:right'), 40, 0);
    const [ac] = (await state(page)).design.site.obstacles;
    expect(ac.width).toBeGreaterThan(600);
    expect(ac.x).toBe(-900);
  });

  test('a room wall widens the room; the wardrobe stays on its wall', async ({ page }) => {
    await page.evaluate(() => { // from above, the whole room in view
      const v = window.__banai.viewer;
      v.controls.target.set(1, 0, 1.4);
      v.camera.position.set(1, 7.5, 4.5);
      v.controls.update();
    });
    await page.waitForTimeout(300);
    const wall = await handleAt(page, 'wall:1');
    expect(wall).not.toBeNull();
    await drag(page, wall, 70, 0);
    const { room } = (await state(page)).design;
    expect(room.shape.width).not.toBe(4000);
    expect(room.offset).toBe(1000);
  });

  test('with the wardrobe selected, a click on another door still selects it', async ({ page }) => {
    await page.evaluate(() => window.__banai.store.select('dr_middle'));
    await page.waitForTimeout(300);
    const left = await page.evaluate(() => window.__banai.viewer.screenPointOfTarget('dr_left'));
    await page.mouse.click(left.x, left.y);
    await expect.poll(async () => (await state(page)).selection?.id).toBe('dr_left');
  });
});
