import { test, expect, openDesigner } from './fixtures.js';

// Furniture and people (ADR-041) with a real mouse: a bed added from the panel stands in the room, drags across
// the floor and takes the free floor in front of the wardrobe; a person drags across the floor and keeps the place.
const state = (page) => page.evaluate(() => window.__banai.store.getState());
const pointOf = (page, target) => page.evaluate((t) => window.__banai.viewer.screenPointOfTarget(t), target);

async function drag(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(from.x + (dx * i) / 8, from.y + (dy * i) / 8);
  await page.mouse.up();
}

test.describe('furniture and people', () => {
  test.beforeEach(async ({ page }) => {
    await openDesigner(page);
    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'set_room', shape: { kind: 'rect', width: 4000, depth: 4000 } }]));
  });

  test('a bed from the panel stands in the room, drags across the floor, and takes the free floor', async ({ page }) => {
    await page.getByTestId('add-furniture-bed').click();
    const [bed] = (await state(page)).design.room.furniture;
    expect(bed).toMatchObject({ type: 'bed', x: 2000, y: 2000, width: 1600, depth: 2000, rotation: 0 });
    await expect(page.getByTestId('room-space')).toContainText('מול הארון 40.0 ס״מ'); // its foot is 40 cm from the doors
    await page.evaluate(() => { // from above, the room in view
      const v = window.__banai.viewer;
      v.controls.target.set(1, 0, 1.4);
      v.camera.position.set(1, 7.5, 4.5);
      v.controls.update();
    });
    await page.waitForTimeout(300);
    await drag(page, await pointOf(page, { kind: 'furniture', index: 0 }), 0, 90); // toward the front: away from the wardrobe
    const [moved] = (await state(page)).design.room.furniture;
    expect(moved.y).toBeGreaterThan(2000);
    expect(moved.x).toBe(2000); // a straight line
    await expect(page.getByTestId('room-space')).not.toContainText('מול הארון 40.0 ס״מ');
    await page.getByTestId('furniture-0-rotation').selectOption('90');
    expect((await state(page)).design.room.furniture[0].rotation).toBe(90);
  });

  test('a person drags across the floor and keeps the place in the project', async ({ page }) => {
    await page.getByTestId('toggle-figure').check();
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.figureShown)).toBe(true);
    await page.evaluate(() => window.__banai.viewer.setView('front'));
    await page.waitForTimeout(900);
    await drag(page, await pointOf(page, { kind: 'figure', index: -1 }), 80, 0);
    const { people } = (await state(page)).design.household;
    expect(people).toHaveLength(1);
    expect(people[0].height).toBe(1700);
    expect(people[0].at[0]).toBeGreaterThan(2450);
  });
});
