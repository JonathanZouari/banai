// "Open doors" is a view setting: hinged doors swing out on their hinges, the design never changes.
import { expect, openDesigner, test } from './fixtures.js';

const rotationOf = (page, id) => page.evaluate((doorId) => window.__banai.viewer.meshOf(doorId).rotation.y, id);
const revision = (page) => page.evaluate(() => window.__banai.store.getState().revision);

test.describe('Open doors', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('the toggle swings the hinged doors open and closed without touching the design', async ({ page }) => {
    const toggle = page.getByTestId('toggle-doors-open');
    const before = await revision(page);
    await expect(toggle).toBeEnabled();
    expect(await rotationOf(page, 'dr_left')).toBeCloseTo(0, 6);

    await toggle.check();
    await expect.poll(() => rotationOf(page, 'dr_left')).toBeLessThan(-1.5); // left hinge turns one way
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.meshOf('dr_middle').rotation.y)).toBeGreaterThan(1.5); // right hinge turns the other way
    expect(await revision(page)).toBe(before);

    await toggle.uncheck();
    await expect.poll(() => rotationOf(page, 'dr_left')).toBeCloseTo(0, 3);
  });

  test('it is disabled when there are no hinged doors', async ({ page }) => {
    await page.getByTestId('toggle-doors-open').check();
    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'configure_doors', type: 'sliding', count: 2, ids: ['dr_s1', 'dr_s2'] }]));
    await expect(page.getByTestId('toggle-doors-open')).toBeDisabled();
  });
});
