import { expect, openDesigner, test } from './fixtures.js';

// The E2E backend serves the real catalog, so these cover the editor -> 3D -> save -> reopen path.
const NEW_COLOURS = { olive_green: '6b7a47', dusty_blue: '6f8aa3' };
const EXISTING_COLOURS = ['white', 'light_grey', 'anthracite', 'black', 'natural_oak', 'walnut'];
const LINK = /#d=[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/;

const design = (page) => page.evaluate(() => window.__banai.store.getState().design);
const hexOf = (page, componentId) => page.evaluate(
  (id) => window.__banai.viewer.meshOf(id)?.material.color.getHexString(),
  componentId,
);

test.describe('new catalog colours and material', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('every colour and material is offered in the editor, old and new', async ({ page }) => {
    for (const id of [...EXISTING_COLOURS, ...Object.keys(NEW_COLOURS)]) {
      await expect(page.getByTestId(`swatch-carcass-${id}`), id).toBeVisible();
      await expect(page.getByTestId(`swatch-doors-${id}`), id).toBeVisible();
    }
    const options = await page.getByTestId('material-carcass').locator('option').allTextContents();
    expect(options).toEqual(expect.arrayContaining(['Melamine board', 'Oak veneer', 'Lacquered MDF', 'Solid wood']));
  });

  for (const [id, hex] of Object.entries(NEW_COLOURS)) {
    test(`${id} recolours the carcass in 3D and leaves the doors alone`, async ({ page }) => {
      await page.getByTestId(`swatch-carcass-${id}`).click();
      await expect.poll(() => hexOf(page, 'carcass')).toBe(hex);
      await expect.poll(async () => (await design(page)).carcass.appearance.color).toEqual({ catalogId: id });
      expect(await hexOf(page, 'dr_left')).toBe('f2f1ed'); // doors keep white
    });

    test(`${id} recolours the doors and leaves the carcass alone`, async ({ page }) => {
      await page.getByTestId(`swatch-doors-${id}`).click();
      for (const door of ['dr_left', 'dr_middle', 'dr_right']) {
        await expect.poll(() => hexOf(page, door), door).toBe(hex);
      }
      expect(await hexOf(page, 'carcass')).toBe('f2f1ed');
    });
  }

  test('an existing colour still works after the new ones were added', async ({ page }) => {
    await page.getByTestId('swatch-carcass-walnut').click();
    await expect.poll(() => hexOf(page, 'carcass')).toBe('6b4a32');
  });

  test('solid wood can be chosen and keeps the colour', async ({ page }) => {
    await page.getByTestId('material-carcass').selectOption('solid_wood');
    await expect.poll(async () => (await design(page)).carcass.appearance.material).toEqual({ catalogId: 'solid_wood' });
    expect(await hexOf(page, 'carcass')).toBe('f2f1ed');
  });

  test('the new look survives Save and reopening the private link', async ({ page, context }) => {
    await page.getByTestId('swatch-carcass-olive_green').click();
    await page.getByTestId('material-carcass').selectOption('solid_wood');
    await page.getByTestId('swatch-doors-dusty_blue').click();
    await expect.poll(() => hexOf(page, 'dr_left')).toBe(NEW_COLOURS.dusty_blue);

    await page.getByTestId('open-save').click();
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('share-link')).toHaveValue(LINK);
    const link = await page.getByTestId('share-link').inputValue();

    const reopened = await context.newPage();
    await reopened.goto(link);
    await reopened.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
    const saved = await reopened.evaluate(() => window.__banai.store.getState().design);
    expect(saved.carcass.appearance.color).toEqual({ catalogId: 'olive_green' });
    expect(saved.carcass.appearance.material).toEqual({ catalogId: 'solid_wood' });
    expect(saved.doors.appearance.color).toEqual({ catalogId: 'dusty_blue' });
    expect(await hexOf(reopened, 'carcass')).toBe(NEW_COLOURS.olive_green);
    expect(await hexOf(reopened, 'dr_left')).toBe(NEW_COLOURS.dusty_blue);
  });
});
