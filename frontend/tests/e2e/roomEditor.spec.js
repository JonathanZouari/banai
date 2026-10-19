import { test, expect, openDesigner } from './fixtures.js';

// The room editor (ADR-037): a template in the panel builds the room's plan and its walls; the wardrobe goes on a
// wall picked in the plan or the list, moves along it, and R27 warns when it is tight against a side wall (its
// fix leaves 5 cm). The free floor in front comes from the plan.
const store = (page) => page.evaluate(() => window.__banai.store.getState());
const advice = (page, id) => page.getByTestId(`advice-${id}`);

async function fill(page, testId, value) {
  const field = page.getByTestId(testId);
  await field.fill(value);
  await field.press('Enter');
}

test.describe('the room editor', () => {
  test.beforeEach(async ({ page }) => {
    await openDesigner(page);
  });

  test('a rectangular room: sizes, a wall from the plan, a corner, the R27 fix, and no room again', async ({ page }) => {
    await page.getByTestId('room-kind').selectOption('rect');
    await expect(page.getByTestId('room-plan')).toBeVisible();
    expect((await store(page)).design.room).toEqual({ shape: { kind: 'rect', width: 3500, depth: 4000 }, wall: 0, offset: 750 });
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
});
