import { test, expect, openDesigner } from './fixtures.js';

// The room editor (ADR-037): a template in the panel builds the room's plan and its walls; the wardrobe goes on a
// wall picked in the plan or the list, moves along it, and R27 warns when it is tight against a side wall (its
// fix leaves 5 cm). The free floor in front comes from the plan.
const store = (page) => page.evaluate(() => window.__banai.store.getState());
const advice = (page, id) => page.getByTestId(`advice-${id}`);
/** The names of the room's door and window meshes in the 3D view (walls3d.js), walking up from the carcass. */
const openingMeshes = (page) => page.evaluate(() => {
  let node = window.__banai.viewer.meshOf('carcass');
  while (node?.parent) node = node.parent;
  const walls = node?.getObjectByName('room-walls');
  return walls ? [...new Set(walls.children.map((c) => c.name).filter((n) => /^room-(door|window)/.test(n)))] : [];
});

async function fill(page, testId, value) {
  const field = page.getByTestId(testId);
  await field.fill(value);
  await field.press('Enter');
}

test.describe('the room editor', () => {
  test.beforeEach(async ({ page }) => {
    await openDesigner(page, { advice: true });
  });

  test('a rectangular room: sizes, a wall from the plan, a corner, the R27 fix, and no room again', async ({ page }) => {
    await page.getByTestId('room-kind').selectOption('rect');
    await expect(page.getByTestId('room-plan')).toBeVisible();
    expect((await store(page)).design.room).toEqual({ shape: { kind: 'rect', width: 3500, depth: 4000 }, wall: 0, offset: 750, openings: [], furniture: [] });
    await expect(page.getByTestId('room-space')).toHaveText('מול הארון 340.0 ס״מ · משמאל 75.0 ס״מ · מימין 75.0 ס״מ עד הקיר.');

    await fill(page, 'room-depth', '300');
    expect((await store(page)).design.room.shape.depth).toBe(3000);
    await page.locator('[data-testid="room-plan"] [data-wall="3"]').click(); // the left wall, from the plan
    await expect(page.getByTestId('room-wall')).toHaveValue('3');
    expect((await store(page)).design.room).toMatchObject({ wall: 3, offset: 500 });

    await fill(page, 'room-offset', '0'); // into the corner with the bottom wall
    await expect(advice(page, 'r27-left')).toContainText('צמוד לקיר משמאל');
    await page.getByTestId('advice-fix-r27-left').click();
    await expect(advice(page, 'r27-left')).toHaveCount(0);
    expect((await store(page)).design.room.offset).toBe(50);

    await page.getByTestId('room-centre').click();
    expect((await store(page)).design.room.offset).toBe(500);
    await page.getByTestId('room-kind').selectOption('none');
    expect((await store(page)).design.room).toBeNull();
    await expect(page.getByTestId('room-plan')).toHaveCount(0);
  });

  test('a room with a niche puts the wardrobe in it, and undo takes the room away', async ({ page }) => {
    await page.getByTestId('room-kind').selectOption('recess');
    await expect(page.getByTestId('room-wall')).toHaveValue('2');
    await expect(page.locator('[data-testid="room-plan"] .room-plan__wall--chosen')).toHaveCount(1);
    expect((await store(page)).design.room).toMatchObject({ wall: 2, offset: 50, shape: { recessWidth: 2100 } });
    await expect(advice(page, 'r27-left')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await store(page)).design.room).toBeNull();
  });

  test('openings: a door from the panel, on the plan and in 3D, R27 when it is in the way, and its fix', async ({ page }) => {
    await page.getByTestId('room-kind').selectOption('rect'); // 3500 x 4000; the 200 cm wardrobe 75 cm along wall 0
    await page.getByTestId('add-opening').click();
    expect((await store(page)).design.room.openings).toEqual([
      { type: 'door', wall: 1, at: 1550, width: 900, height: 2100, sill: null, hinge: 'left', swing: 'in' }]);
    await expect(page.locator('[data-testid="room-plan"] .room-plan__opening--door .room-plan__swing')).toHaveCount(1);
    await expect.poll(() => openingMeshes(page)).toEqual(['room-door-0']);

    // On the wardrobe's own wall it stands behind the carcass: the wardrobe blocks it, and there is no place to move.
    await page.getByTestId('opening-0-wall').selectOption('0');
    await expect(advice(page, 'r27-block-1')).toContainText('הארון חוסם דלת');
    await expect(page.getByTestId('advice-fix-r27-block-1')).toHaveCount(0);
    // A window there instead, then raised above the wardrobe's top: nothing hidden.
    await page.getByTestId('opening-0-type').selectOption('window');
    await expect(advice(page, 'r27-block-1')).toContainText('הארון מסתיר חלון');
    await expect.poll(() => openingMeshes(page)).toEqual(['room-window-0']);
    await fill(page, 'opening-0-sill', '250');
    await expect(advice(page, 'r27-block-1')).toHaveCount(0);

    // A door in the right wall, 30 cm from its start, swings into the wardrobe's end; the fix moves the wardrobe.
    await page.getByTestId('add-opening').click();
    await fill(page, 'opening-1-at', '30');
    await expect(advice(page, 'r27-door-2')).toContainText('הדלת נפתחת לתוך הארון');
    await page.getByTestId('advice-fix-r27-door-2').click();
    await expect(advice(page, 'r27-door-2')).toHaveCount(0);
    expect((await store(page)).design.room.offset).toBeLessThan(750);

    await page.getByTestId('opening-1-remove').click();
    expect((await store(page)).design.room.openings).toHaveLength(1);
  });
});
