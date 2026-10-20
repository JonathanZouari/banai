import { test, expect, openDesigner } from './fixtures.js';

const dimension = (page) => page.evaluate(() => window.__banai.store.getState().design.dimensions.width);

test.describe('units switch', () => {
  test('offers only cm and in, cm selected by default', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByTestId('unit-switch')).toBeVisible();
    await expect(page.getByTestId('unit-cm')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('unit-in')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('unit-mm')).toHaveCount(0);
    await expect(page.getByTestId('dim-width')).toHaveValue('200.0');
  });

  test('changes the editor fields and the 3D dimension labels, never the design', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('unit-in').click();
    await expect(page.getByTestId('dim-width')).toHaveValue('78.74');
    await expect(page.getByText('W 78.74 in', { exact: true })).toBeVisible();
    await page.getByTestId('unit-cm').click();
    await expect(page.getByTestId('dim-width')).toHaveValue('200.0');
    await expect(page.getByText('W 200.0 cm', { exact: true })).toBeVisible();
    expect(await dimension(page)).toBe(2000);
  });

  test('typing in inches is converted to the right size', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('unit-in').click();
    await page.getByTestId('dim-width').fill('80');
    await page.getByTestId('dim-width').press('Enter');
    await expect.poll(() => dimension(page)).toBe(2032);
    await expect(page.getByTestId('dim-width')).toHaveValue('80.00');
  });

  test('a bad number names the unit in its message', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('unit-in').click();
    await page.getByTestId('dim-width').fill('abc');
    await page.getByTestId('dim-width').press('Enter');
    await expect(page.getByText('Enter a number in in, e.g. 25.5')).toBeVisible();
    expect(await dimension(page)).toBe(2000);
  });

  test('a remembered mm choice from before falls back to cm', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('banai.units', 'mm'));
    await openDesigner(page);
    await expect(page.getByTestId('unit-cm')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('W 200.0 cm', { exact: true })).toBeVisible();
  });

  test('is remembered after a reload', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('unit-in').click();
    await page.reload();
    await page.getByTestId('entry-basic').click();
    await expect(page.getByTestId('unit-in')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('dim-width')).toHaveValue('78.74');
  });

  test('selected-component labels follow the unit too', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('unit-in').click();
    await page.evaluate(() => window.__banai.store.select('shf_l1'));
    await expect(page.locator('.dim-label--selected')).toContainText('in from base');
  });
});
