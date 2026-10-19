import { test, expect, openDesigner } from './fixtures.js';

// The household and child safety (2026-10-19): figures at chosen heights beside the wardrobe; a child under
// 140 cm brings R26 (anchor the wardrobe, child locks with a release at an adult height), as a pop-up.
const store = (page) => page.evaluate(() => window.__banai.store.getState());

test('a child in the household: a figure at their height, the safety pop-up, and locks with an adult-height release', async ({ page }) => {
  await openDesigner(page);
  await page.getByTestId('person-add-adult').click();
  await expect.poll(async () => (await store(page)).ui.showFigure).toBe(true); // a new person is seen at once
  await page.getByTestId('person-add-child').click();
  await expect.poll(async () => (await store(page)).design.household.people.map((p) => p.height)).toEqual([1700, 1100]);
  await expect.poll(() => page.evaluate(() => window.__banai.viewer.figureShown)).toBe(true);
  await expect(page.locator('.figure-label').nth(1)).toHaveText('110.0 ס״מ');

  await expect(page.getByTestId('alert-sheet')).toContainText(/יש ילד בבית: לקבע את הארון לקיר|נעילת ילדים לדלתות ולמגירות/);
  await expect(page.getByTestId('advice-r26-anchor')).toBeVisible();
  await page.getByTestId('advice-fix-r26-lock').click();
  const { fittings } = (await store(page)).design;
  expect(fittings).toMatchObject({ childLock: true, releaseHeight: 1500 });
  await expect(page.getByTestId('advice-r26-lock')).toHaveCount(0);
  await expect(page.getByTestId('child-lock')).toBeChecked();

  const height = page.getByTestId('person-height-1');
  await height.fill('125');
  await height.press('Enter');
  await expect(page.getByTestId('advice-r26-release')).toContainText('לחצן השחרור בהישג יד של ילד');
  await page.getByTestId('advice-fix-r26-release').click();
  expect((await store(page)).design.fittings.releaseHeight).toBe(1650);
});

test('a name and a removal; adults only bring no child-safety advice', async ({ page }) => {
  await openDesigner(page);
  await page.getByTestId('person-add-adult').click();
  const name = page.getByTestId('person-name-0');
  await name.fill('אבא');
  await name.press('Enter');
  await expect.poll(async () => (await store(page)).design.household.people[0].name).toBe('אבא');
  await expect(page.locator('[data-testid^="advice-r26"]')).toHaveCount(0);
  await page.getByTestId('person-remove-0').click();
  await expect.poll(async () => (await store(page)).design.household.people).toEqual([]);
});
