import { expect, openDesigner, test } from './fixtures.js';

const carcassAppearance = (page) => page.evaluate(() => window.__banai.store.getState().design.carcass.appearance);

test.describe('catalog: olive green and solid oak', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('olive green is offered and changes the wardrobe colour in 3D', async ({ page }) => {
    await page.getByRole('button', { name: 'Olive green' }).first().click();
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.meshOf('carcass').material.color.getHexString())).toBe('6b6b3a');
    expect((await carcassAppearance(page)).color).toEqual({ catalogId: 'olive_green' });
  });

  test('solid oak is offered as a material and shows a wood grain in 3D', async ({ page }) => {
    await page.getByLabel('Material').first().selectOption('solid_oak');
    await expect.poll(async () => (await carcassAppearance(page)).material).toEqual({ catalogId: 'solid_oak' });
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.meshOf('carcass').material.map !== null)).toBe(true);
  });
});
