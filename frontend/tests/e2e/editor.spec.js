import { clickComponent, expect, openDesigner, test } from './fixtures.js';

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
    await page.getByLabel('Show interior').check();
    await clickComponent(page, 'shf_l2');
    const shelfY = page.getByTestId('shelf-y');
    await expect(shelfY).toHaveValue('80.0');
    const before = await meshY(page, 'shf_l2');
    await commit(shelfY, '100');
    await expect.poll(async () => (await state(page)).design.compartments[0].shelves[1].y).toBe(1000);
    await expect.poll(() => meshY(page, 'shf_l2')).toBeCloseTo(before + 0.2, 3);
    await expect(page.locator('.dim-label--selected')).toHaveText('Shelf · 100.0 cm from base · 1.8 cm thick');
  });

  test('changing the overall width rescales compartments and the 3D view', async ({ page }) => {
    await commit(page.getByTestId('dim-width'), '240');
    await expect.poll(async () => (await state(page)).design.dimensions.width).toBe(2400);
    const { design } = await state(page);
    expect(design.compartments.map((c) => c.width).reduce((a, b) => a + b)).toBe(2400 - 36 - 36);
    await expect(page.getByText('W 240.0 cm', { exact: true })).toBeVisible();
  });

  test('invalid input shows an inline error and leaves the design unchanged', async ({ page }) => {
    const { revision } = await state(page);
    await commit(page.getByTestId('dim-height'), 'abc');
    await expect(page.getByText('Enter a number in cm, e.g. 64.5')).toBeVisible();
    await page.getByLabel('Show interior').check();
    await clickComponent(page, 'shf_l1');
    await commit(page.getByTestId('shelf-y'), '81');
    await expect(page.getByText('That would overlap another shelf or drawer. Choose a different position.')).toBeVisible();
    expect((await state(page)).revision).toBe(revision);
    expect((await state(page)).design.compartments[0].shelves[0].y).toBe(400);
  });

  test('adds a drawer to a compartment selected from the list', async ({ page }) => {
    await page.getByTestId('select-cmp_middle').click();
    expect((await state(page)).selection).toEqual({ id: 'cmp_middle', kind: 'compartment' });
    await page.getByTestId('add-drawer').click();
    await expect.poll(async () => (await state(page)).design.compartments[1].drawers.length).toBe(1);
  });

  test('changing the carcass colour updates the rendered material', async ({ page }) => {
    await page.getByRole('button', { name: 'Walnut' }).first().click();
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.meshOf('carcass').material.color.getHexString())).toBe('6b4a32');
  });

  test('the new olive green catalog colour is offered and recolours the carcass', async ({ page }) => {
    await page.getByRole('button', { name: 'Olive green' }).first().click();
    await expect.poll(async () => (await state(page)).design.carcass.appearance.color).toEqual({ catalogId: 'olive_green' });
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.meshOf('carcass').material.color.getHexString())).toBe('6b6f45');
  });

  test('each wardrobe part has its own labelled materials card with a summary of the current choice', async ({ page }) => {
    const carcass = page.getByTestId('appearance-carcass');
    const doors = page.getByTestId('appearance-doors');
    // Each card is a group named by its own heading.
    await expect(carcass).toHaveAttribute('role', 'group');
    await expect(carcass).toHaveAccessibleName('Carcass & interior');
    await expect(doors).toHaveAccessibleName('Doors');
    await expect(carcass.getByRole('heading', { level: 4, name: 'Carcass & interior' })).toBeVisible();
    await expect(doors.getByRole('heading', { level: 4, name: 'Doors' })).toBeVisible();
    // Distinct accessible names for the two colour groups.
    await expect(page.getByRole('group', { name: 'Carcass & interior colour' })).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Doors colour' })).toHaveCount(1);
    await expect(doors).toContainText('Melamine board · White · Matte');
    await doors.getByRole('button', { name: 'Navy blue' }).click();
    await expect(page.getByTestId('appearance-doors')).toContainText('Colour: Navy blue');
    await expect(page.getByTestId('appearance-doors')).toContainText('Melamine board · Navy blue · Matte');
    await expect(page.getByTestId('appearance-carcass')).toContainText('Colour: White');
  });

  test('keyboard focus stays on the swatch or finish option that was just chosen', async ({ page }) => {
    await page.getByTestId('swatch-doors-terracotta').focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await state(page)).design.doors.appearance.color).toEqual({ catalogId: 'terracotta' });
    await expect(page.getByTestId('swatch-doors-terracotta')).toBeFocused();
    await page.getByTestId('finish-carcass-gloss').focus();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await state(page)).design.carcass.appearance.finish).toEqual({ catalogId: 'gloss' });
    await expect(page.getByTestId('finish-carcass-gloss')).toBeFocused();
  });

  test('switching to sliding doors rebuilds the doors', async ({ page }) => {
    await page.getByTestId('door-type').getByRole('button', { name: 'Sliding' }).click();
    await expect.poll(async () => (await state(page)).design.doors.type).toBe('sliding');
    await expect(page.getByTestId('sliding-count')).toHaveValue('2');
  });

  test('custom colour names are rendered as text, never as markup', async ({ page }) => {
    await page.getByText('Custom colour…').first().click();
    await page.getByLabel('Custom colour name').first().fill('<b>Sage</b>');
    await page.getByRole('button', { name: 'Apply custom colour' }).first().click();
    await expect(page.getByText('Custom: <b>Sage</b>').first()).toBeVisible();
    expect(await page.locator('#properties-content b').count()).toBe(0);
  });

  test('deleting the selected shelf removes it and clears the selection', async ({ page }) => {
    await page.getByLabel('Show interior').check();
    await clickComponent(page, 'shf_r1');
    await page.getByTestId('delete-selected').click();
    await expect.poll(async () => (await state(page)).design.compartments[2].shelves.length).toBe(1);
    expect((await state(page)).selection).toBeNull();
  });
});
