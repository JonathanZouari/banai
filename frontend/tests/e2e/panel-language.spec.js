import { test, expect, openDesigner } from './fixtures.js';

test.describe('the language switch also translates the properties panel and the header', () => {
  test('Hebrew: panel, header buttons and catalog names, right to left; back to English restores them', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
    await expect(page.getByTestId('open-save')).toHaveText('Save');
    await page.getByTestId('lang-he').click();
    await expect(page.getByRole('heading', { name: 'מאפיינים' })).toBeVisible();
    await expect(page.locator('#properties-panel')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('open-save')).toHaveText('שמירה');
    await expect(page.getByTestId('open-render')).toHaveText('הדמיה');
    await expect(page.getByTestId('undo')).toHaveText('ביטול פעולה');
    await expect(page.getByText('הצגת פנים')).toBeVisible();
    await expect(page.locator('#properties-content').getByText('רוחב').first()).toBeVisible();
    await expect(page.locator('#properties-content').getByText('גובה').first()).toBeVisible();
    await expect(page.locator('#properties-content').getByText('דלתות').first()).toBeVisible();
    await expect(page.locator('#properties-content select option:checked').first()).toHaveText('לוח מלמין'); // the catalog's "Melamine board"
    await expect(page.locator('#properties-content').getByText('מט').first()).toBeVisible(); // "Matte"
    await expect(page.locator('#properties-content').getByText('Width')).toHaveCount(0);
    await page.getByTestId('lang-en').click();
    await expect(page.locator('#properties-panel')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
    await expect(page.getByTestId('open-save')).toHaveText('Save');
    await expect(page.locator('#properties-content select option:checked').first()).toHaveText('Melamine board');
  });

  test('a selected component, its fields and its 3D label follow the language', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('lang-he').click();
    await page.evaluate(() => window.__banai.store.select('shf_l1'));
    await expect(page.getByTestId('selected-section')).toContainText('נבחר · מדף');
    await expect(page.getByTestId('selected-section')).toContainText('גובה מהבסיס');
    await expect(page.getByTestId('delete-selected')).toContainText('מחיקת מדף');
    await expect(page.locator('.dim-label--selected')).toContainText('מדף');
    await page.getByTestId('lang-en').click();
    await expect(page.getByTestId('selected-section')).toContainText('Selected · Shelf');
    await expect(page.locator('.dim-label--selected')).toContainText('Shelf');
  });

  test('error messages are in the selected language, and the design is untouched', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('lang-he').click();
    await page.getByTestId('dim-width').fill('abc');
    await page.getByTestId('dim-width').press('Enter');
    await expect(page.getByText('הזינו מספר ב-cm, למשל 64.5')).toBeVisible();
    expect(await page.evaluate(() => window.__banai.store.getState().design.dimensions.width)).toBe(2000);
    await page.getByTestId('dim-height').fill('9999');
    await page.getByTestId('dim-height').press('Enter');
    await expect(page.getByText('הערך מחוץ לטווח המותר.')).toBeVisible();
  });

  test('switching the language does not change the design or the revision', async ({ page }) => {
    await openDesigner(page);
    const before = await page.evaluate(() => window.__banai.store.getState().revision);
    await page.getByTestId('lang-he').click();
    await page.getByTestId('lang-en').click();
    expect(await page.evaluate(() => window.__banai.store.getState().revision)).toBe(before);
  });

  test('units and language combine: Hebrew with inches', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('lang-he').click();
    await page.getByTestId('unit-in').click();
    await expect(page.getByTestId('dim-width')).toHaveValue('78.74');
    await page.getByTestId('dim-width').fill('x');
    await page.getByTestId('dim-width').press('Enter');
    await expect(page.getByText('הזינו מספר ב-in, למשל 25.5')).toBeVisible();
  });
});
