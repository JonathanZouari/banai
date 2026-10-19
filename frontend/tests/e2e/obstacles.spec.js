import { test, expect, openDesigner } from './fixtures.js';

// Wall obstacles and the scale figure (ADR-031). An obstacle the carcass covers gets advisory R23 and is
// drawn dashed in the front plane with its name; an AC unit high enough to lower under offers that fix. The
// "דמות" switch shows a 170 cm figure beside the wardrobe. Advice only: the design changes through a tap.
const advice = (page, id) => page.getByTestId(`advice-${id}`);
const store = (page) => page.evaluate(() => window.__banai.store.getState());

async function fill(page, testId, value) {
  const field = page.getByTestId(testId);
  await field.fill(value);
  await field.press('Enter');
}

test.describe('wall obstacles and the scale figure', () => {
  test.beforeEach(async ({ page }) => {
    await openDesigner(page);
  });

  test('an AC unit behind the wardrobe: R23 warns, the outline is drawn, and the fix lowers the wardrobe', async ({ page }) => {
    await page.getByTestId('add-obstacle').click();
    await expect(page.getByTestId('obstacle-0')).toBeVisible();
    expect((await store(page)).design.site.obstacles).toEqual([{ type: 'socket', x: 960, y: 300, width: 80, height: 80, name: null }]);
    await expect(advice(page, 'r23-1')).toContainText('שקע מאחורי הארון');
    await page.getByTestId('obstacle-0-type').selectOption('ac');
    await fill(page, 'obstacle-0-y', '210');
    await fill(page, 'obstacle-0-width', '90');
    await expect(advice(page, 'r23-1')).toContainText('מזגן בתחום הארון');
    await expect(page.locator('.room-label--small')).toHaveText('מזגן · 90×8'); // name and size in cm
    expect((await store(page)).design.dimensions.height).toBe(2400); // advice changed nothing by itself
    await page.getByTestId('advice-fix-r23-1').click();
    await expect(advice(page, 'r23-1')).toHaveCount(0);
    expect((await store(page)).design.dimensions.height).toBe(2090);
    await page.getByTestId('obstacle-0-remove').click();
    expect((await store(page)).design.site).toBeNull();
    await expect(page.locator('.room-label--small')).toHaveCount(0);
  });

  test('anything else on the wall: "אחר" with the customer\'s name for it, labelled in the viewer', async ({ page }) => {
    await page.getByTestId('add-obstacle').click();
    await page.getByTestId('obstacle-0-type').selectOption('other');
    await expect(page.getByTestId('obstacle-0-name')).toHaveValue('מכשול');
    await fill(page, 'obstacle-0-name', 'רדיאטור');
    await fill(page, 'obstacle-0-width', '80');
    await fill(page, 'obstacle-0-height', '60');
    expect((await store(page)).design.site.obstacles[0]).toMatchObject({ type: 'other', name: 'רדיאטור', width: 800, height: 600 });
    await expect(page.locator('.room-label--small')).toHaveText('רדיאטור · 80×60');
    await expect(advice(page, 'r23-1')).toContainText('רדיאטור מאחורי הארון');
    await fill(page, 'obstacle-0-name', '   ');
    expect((await store(page)).design.site.obstacles[0].name).toBe('רדיאטור'); // an empty name is refused
  });

  test('the figure switch shows a 170 cm person beside the wardrobe, and hides it again', async ({ page }) => {
    const shown = () => page.evaluate(() => window.__banai.viewer.figureShown);
    expect(await shown()).toBe(false);
    await page.getByTestId('toggle-figure').check();
    await expect.poll(shown).toBe(true);
    expect((await store(page)).ui.showFigure).toBe(true);
    await page.getByTestId('toggle-figure').uncheck();
    await expect.poll(shown).toBe(false);
  });
});
