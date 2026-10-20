import { test, expect, openDesigner } from './fixtures.js';

// Drag in 3D (ADR-039) with a real mouse: the selected wardrobe slides along its wall, a selected shelf moves up
// and down between its neighbours, an obstacle stays on the wall in a straight line (skirting along the floor),
// a press on something not selected still orbits, Escape puts it back, the arrows nudge, and every drop is
// one undo step.
const state = (page) => page.evaluate(() => window.__banai.store.getState());
const run = (page, ops) => page.evaluate((o) => window.__banai.store.dispatch(o), ops);
const pointOf = (page, target) => page.evaluate((t) => window.__banai.viewer.screenPointOfTarget(t), target);

async function drag(page, from, dx, dy, { release = true } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(from.x + (dx * i) / 8, from.y + (dy * i) / 8);
  if (release) await page.mouse.up();
}

test.describe('drag in 3D', () => {
  test.beforeEach(async ({ page }) => {
    await openDesigner(page);
    await run(page, [{ op: 'set_room', shape: { kind: 'rect', width: 4000, depth: 4000 } }]); // the wardrobe at 100 cm
    await page.evaluate(() => window.__banai.viewer.setView('front'));
    await page.waitForTimeout(800);
  });

  test('the selected wardrobe slides along its wall, shows its place, and one Ctrl+Z puts it back', async ({ page }) => {
    test.slow(); // several drags with a real mouse: past 30 s on a busy machine
    const door = await pointOf(page, 'dr_middle');
    await drag(page, door, 140, 0); // not selected: an orbit, nothing moves
    expect((await state(page)).design.room.offset).toBe(1000);

    await page.evaluate(() => window.__banai.viewer.setView('front'));
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__banai.store.select('dr_middle'));
    const from = await pointOf(page, 'dr_middle');
    await drag(page, from, 140, 30, { release: false });
    await expect(page.getByTestId('drag-label')).toContainText('ס״מ מתחילת הקיר');
    await page.mouse.up();
    await expect(page.getByTestId('drag-label')).toBeHidden();
    const { design, history } = await state(page);
    expect(design.room.offset).toBeGreaterThan(1000);
    expect(design.room.offset % 10).toBe(0);
    expect(design.dimensions).toEqual({ width: 2000, height: 2400, depth: 600 }); // it only moved
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await state(page)).design.room.offset).toBe(1000);
    expect(history.undo).toBeGreaterThan(0);
  });

  test('a selected shelf moves up only as far as the shelf above; Escape cancels a drag', async ({ page }) => {
    test.slow(); // several drags with a real mouse: past 30 s on a busy machine
    await page.evaluate(() => window.__banai.store.select('shf_l2'));
    await page.waitForTimeout(300);
    const shelf = await pointOf(page, 'shf_l2');
    await drag(page, shelf, 0, -60);
    const y = (await state(page)).design.compartments[0].shelves[1].y;
    expect(y).toBeGreaterThan(800);
    expect(y).toBeLessThanOrEqual(1182);

    const again = await pointOf(page, 'shf_l2');
    await drag(page, again, 0, -600); // far past the shelf above: it stops under it
    expect((await state(page)).design.compartments[0].shelves[1].y).toBe(1182);

    const last = await pointOf(page, 'shf_l2');
    await drag(page, last, 0, 80, { release: false });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect((await state(page)).design.compartments[0].shelves[1].y).toBe(1182);
  });

  test('obstacles stay on the wall in a straight line; skirting stays on the floor', async ({ page }) => {
    await run(page, [{ op: 'set_site', obstacles: [
      { type: 'socket', x: -600, y: 600, width: 200, height: 200 }, { type: 'panel', x: -900, y: 0, width: 400, height: 100 }] }]);
    await page.waitForTimeout(300);
    const socket = await pointOf(page, { kind: 'obstacle', index: 0 });
    await drag(page, socket, -70, 12); // mostly sideways: only x changes
    let [moved, skirting] = (await state(page)).design.site.obstacles;
    expect(moved.x).toBeLessThan(-600);
    expect(moved.y).toBe(600);

    const up = await pointOf(page, { kind: 'obstacle', index: 0 });
    await drag(page, up, 8, -70); // mostly up: only y changes
    [moved, skirting] = (await state(page)).design.site.obstacles;
    expect(moved.y).toBeGreaterThan(600);

    const panel = await pointOf(page, { kind: 'obstacle', index: 1 });
    await drag(page, panel, 0, -80); // skirting cannot leave the floor
    [moved, skirting] = (await state(page)).design.site.obstacles;
    expect(skirting.y).toBe(0);
  });

  test('the arrows nudge the selected part: 1 cm, Shift 10 cm', async ({ page }) => {
    await page.evaluate(() => window.__banai.store.select('shf_l2'));
    await page.keyboard.press('ArrowUp');
    expect((await state(page)).design.compartments[0].shelves[1].y).toBe(810);
    await page.keyboard.press('Shift+ArrowUp');
    expect((await state(page)).design.compartments[0].shelves[1].y).toBe(910);
    await page.evaluate(() => window.__banai.store.select('dr_left'));
    await page.keyboard.press('ArrowLeft');
    expect((await state(page)).design.room.offset).toBe(990);
  });

  test('the wardrobe hides what is behind it', async ({ page }) => {
    await run(page, [{ op: 'set_site', obstacles: [{ type: 'socket', x: 900, y: 1000, width: 120, height: 120 }] }]); // behind the doors
    await page.waitForTimeout(300);
    const behind = await pointOf(page, { kind: 'obstacle', index: 0 });
    await drag(page, behind, 80, 0); // a press on the doors: the camera turns, the socket stays
    expect((await state(page)).design.site.obstacles[0]).toMatchObject({ x: 900, y: 1000 });
  });

  test('an undo during a drag drops nothing', async ({ page }) => {
    await page.evaluate(() => window.__banai.store.select('shf_l2'));
    await page.keyboard.press('ArrowUp'); // 810: something to undo
    const shelf = await pointOf(page, 'shf_l2');
    await drag(page, shelf, 0, -60, { release: false });
    await page.evaluate(() => window.__banai.store.undo()); // the design changes under the drag
    await page.mouse.up();
    expect((await state(page)).design.compartments[0].shelves[1].y).toBe(800);
    expect(await page.evaluate(() => window.__banai.viewer.dragging)).toBe(false);
  });
});
