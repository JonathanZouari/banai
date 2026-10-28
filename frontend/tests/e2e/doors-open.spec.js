// "Doors open" switch: a view setting that swings hinged doors (or slides sliding panels) without
// touching the design, while the interior stays pickable.
import { clickComponent, expect, openDesigner, test } from './fixtures.js';

const doorsOpen = (page) => page.getByTestId('toggle-doors-open');
const state = (page) => page.evaluate(() => {
  const { design, revision, selection, ui } = window.__banai.store.getState();
  return { design, revision, selection, ui };
});
const settled = (page, amount) => page.waitForFunction((a) => window.__banai.viewer.doorOpenAmount() === a, amount);
const rotationY = (page, id) => page.evaluate((doorId) => window.__banai.viewer.meshOf(doorId).rotation.y, id);
const positionX = (page, id) => page.evaluate((doorId) => window.__banai.viewer.meshOf(doorId).position.x, id);

test.describe('doors open / closed', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('opening swings the hinged doors outward and leaves the design untouched', async ({ page }) => {
    const before = await state(page);
    await doorsOpen(page).check();
    await settled(page, 1);
    expect(await rotationY(page, 'dr_left')).toBeCloseTo(-95 * Math.PI / 180, 3);
    expect(await rotationY(page, 'dr_middle')).toBeCloseTo(95 * Math.PI / 180, 3);
    const after = await state(page);
    expect(after.design).toEqual(before.design);
    expect(after.revision).toBe(before.revision);
    expect(after.ui.doorsOpen).toBe(true);

    await doorsOpen(page).uncheck();
    await settled(page, 0);
    expect(await rotationY(page, 'dr_left')).toBeCloseTo(0, 6);
  });

  test('a shelf can be picked through the open doors, and the doors stay visible', async ({ page }) => {
    await doorsOpen(page).check();
    await settled(page, 1);
    await clickComponent(page, 'shf_l2');
    await expect.poll(async () => (await state(page)).selection?.id).toBe('shf_l2');
    await expect(page.getByTestId('shelf-y')).toHaveValue('80.0');
    expect((await state(page)).ui.doorsVisible).toBe(true);
    expect(await page.evaluate(() => Boolean(window.__banai.viewer.meshOf('dr_left')))).toBe(true);
  });

  test('sliding panels slide aside', async ({ page }) => {
    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'configure_doors', type: 'sliding', ids: ['dr_a', 'dr_b'] }]));
    const closedX = await positionX(page, 'dr_b');
    await doorsOpen(page).check();
    await settled(page, 1);
    expect(await positionX(page, 'dr_b')).toBeCloseTo(await positionX(page, 'dr_a'), 4);
    expect(await positionX(page, 'dr_b')).toBeLessThan(closedX);
  });

  test('the switch is disabled while the doors are hidden', async ({ page }) => {
    await page.getByLabel('Show interior').check();
    await expect(doorsOpen(page)).toBeDisabled();
    await page.getByLabel('Show interior').uncheck();
    await expect(doorsOpen(page)).toBeEnabled();
  });
});
