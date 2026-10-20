import { test, expect, openDesigner, chooseSetting, selection } from './fixtures.js';

const compartment = (page, id) => page.evaluate((cid) => window.__banai.store.getState().design.compartments.find((c) => c.id === cid), id);

test.describe('interior section: one card per compartment', () => {
  test('shows a card per compartment, left to right, with its items bottom to top', async ({ page }) => {
    await openDesigner(page);
    const cards = page.getByTestId('interior-section').locator('.interior-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText('Compartment 1');
    await expect(cards.nth(0)).toContainText('Shelves 4 · Drawers 0 · Rails 0');
    await expect(page.getByTestId('item-shf_l1')).toHaveText('Shelf at 40 cm');
    await expect(page.getByTestId('item-rail_m1')).toContainText('Hanging rail at');
    await expect(page.getByTestId('interior-cmp_right').locator('.interior-item__label').first()).toHaveText('Drawer 0–20 cm');
  });

  test('items follow the display unit', async ({ page }) => {
    await openDesigner(page);
    await chooseSetting(page, 'unit-in');
    await expect(page.getByTestId('item-shf_l1')).toHaveText('Shelf at 15.75 in');
  });

  test('clicking an item or a card title selects it and shows the interior', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('item-shf_l2').click();
    expect(await selection(page)).toEqual({ id: 'shf_l2', kind: 'shelf' });
    await expect(page.getByTestId('view-interior')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('interior-cmp_left')).toHaveAttribute('aria-current', 'true');
    await page.getByTestId('interior-select-cmp_middle').click();
    expect(await selection(page)).toEqual({ id: 'cmp_middle', kind: 'compartment' });
    await expect(page.getByTestId('interior-cmp_middle')).toHaveClass(/is-selected/);
  });

  test('add and remove items from a card', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('add-drawer-cmp_left').click();
    expect((await compartment(page, 'cmp_left')).drawers).toHaveLength(1);
    await page.getByTestId('remove-item-shf_l1').click();
    expect((await compartment(page, 'cmp_left')).shelves.map((s) => s.id)).not.toContain('shf_l1');
    await expect(page.getByTestId('item-shf_l1')).toHaveCount(0);
  });

  test('a quick layout replaces the contents in one change, and one Undo restores them', async ({ page }) => {
    await openDesigner(page);
    const before = await compartment(page, 'cmp_left');
    await page.getByTestId('layout-hanging-cmp_left').click();
    const after = await compartment(page, 'cmp_left');
    expect([after.shelves.length, after.drawers.length, after.rails.length]).toEqual([1, 0, 1]);
    await expect(page.getByTestId('interior-cmp_left')).toContainText('Shelves 1 · Drawers 0 · Rails 1');
    await page.getByTestId('undo').click();
    expect(await compartment(page, 'cmp_left')).toEqual(before);
  });

  test('an empty compartment says so', async ({ page }) => {
    await openDesigner(page);
    const ids = (await compartment(page, 'cmp_left')).shelves.map((s) => s.id);
    await page.evaluate((list) => window.__banai.store.dispatch(list.map((id) => ({ op: 'remove_component', id }))), ids);
    await expect(page.getByTestId('interior-cmp_left')).toContainText('Empty');
  });

  test('Hebrew labels', async ({ page }) => {
    await openDesigner(page);
    await chooseSetting(page, 'lang-he');
    await expect(page.getByTestId('interior-section')).toContainText('פנים הארון');
    await expect(page.getByTestId('item-shf_l1')).toHaveText('מדף בגובה 40 cm');
    await expect(page.getByTestId('layout-shelves-cmp_left')).toHaveText('מדפים');
  });
});
