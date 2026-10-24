import { clickComponent, expect, openDesigner, openStep, test } from './fixtures.js';

const state = (page) => page.evaluate(() => {
  const { design, revision, selection } = window.__banai.store.getState();
  return { design, revision, selection };
});
const meshY = (page, id) => page.evaluate((componentId) => window.__banai.viewer.meshOf(componentId)?.position.y, id);

async function commit(locator, value) {
  await locator.fill(value);
  await locator.press('Enter');
}

test.describe('Phase 4: manual editing', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('selecting a shelf in 3D shows its properties; editing its height moves the mesh', async ({ page }) => {
    await page.getByLabel('הצגת פנים הארון').check();
    await clickComponent(page, 'shf_l2');
    const shelfY = page.getByTestId('shelf-y');
    await expect(shelfY).toHaveValue('80.0');
    const before = await meshY(page, 'shf_l2');
    await commit(shelfY, '100');
    await expect.poll(async () => (await state(page)).design.compartments[0].shelves[1].y).toBe(1000);
    await expect.poll(() => meshY(page, 'shf_l2')).toBeCloseTo(before + 0.2, 3);
    await expect(page.locator('.dim-label--selected')).toHaveText('מדף · 100.0 ס״מ מהבסיס · עובי 1.8 ס״מ');
  });

  test('changing the overall width rescales compartments and the 3D view', async ({ page }) => {
    await commit(page.getByTestId('dim-width'), '240');
    await expect.poll(async () => (await state(page)).design.dimensions.width).toBe(2400);
    const { design } = await state(page);
    expect(design.compartments.map((c) => c.width).reduce((a, b) => a + b)).toBe(2400 - 36 - 36);
    await expect(page.getByText('רוחב 240.0 ס״מ', { exact: true })).toBeVisible();
  });

  test('invalid input shows an inline error and leaves the design unchanged', async ({ page }) => {
    const { revision } = await state(page);
    await commit(page.getByTestId('dim-height'), 'abc');
    await expect(page.getByText('הזינו מספר בס״מ, למשל 64.5')).toBeVisible();
    await page.getByLabel('הצגת פנים הארון').check();
    await clickComponent(page, 'shf_l1');
    await commit(page.getByTestId('shelf-y'), '81');
    await expect(page.getByText('זה יחפוף מדף או מגירה אחרים. בחרו מיקום אחר.')).toBeVisible();
    expect((await state(page)).revision).toBe(revision);
    expect((await state(page)).design.compartments[0].shelves[0].y).toBe(400);
  });

  test('adds a drawer to a compartment selected from the list', async ({ page }) => {
    await openStep(page, 'interior');
    await page.getByTestId('select-cmp_middle').click();
    expect((await state(page)).selection).toEqual({ id: 'cmp_middle', kind: 'compartment' });
    await page.getByTestId('add-drawer').click();
    await expect.poll(async () => (await state(page)).design.compartments[1].drawers.length).toBe(1);
  });

  test('changing the carcass colour updates the rendered material', async ({ page }) => {
    await openStep(page, 'materials');
    await page.getByRole('button', { name: 'אגוז' }).first().click();
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.meshOf('carcass').material.color.getHexString())).toBe('6b4a32');
  });

  test('switching to sliding doors rebuilds the doors', async ({ page }) => {
    await openStep(page, 'doors');
    await page.getByTestId('door-type').getByRole('button', { name: 'הזזה' }).click();
    await expect.poll(async () => (await state(page)).design.doors.type).toBe('sliding');
    await expect(page.getByTestId('sliding-count')).toHaveValue('2');
  });

  test('custom colour names are rendered as text, never as markup', async ({ page }) => {
    await openStep(page, 'materials');
    await page.getByText('צבע מותאם…').first().click();
    await page.getByLabel('שם הצבע המותאם').first().fill('<b>Sage</b>');
    await page.getByRole('button', { name: 'החלת הצבע המותאם' }).first().click();
    await expect(page.getByText('מותאם: <b>Sage</b>').first()).toBeVisible();
    expect(await page.locator('#properties-content b').count()).toBe(0);
  });

  test('deleting the selected shelf removes it and clears the selection', async ({ page }) => {
    await page.getByLabel('הצגת פנים הארון').check();
    await clickComponent(page, 'shf_r1');
    await page.getByTestId('delete-selected').click();
    await expect.poll(async () => (await state(page)).design.compartments[2].shelves.length).toBe(1);
    expect((await state(page)).selection).toBeNull();
  });
});
