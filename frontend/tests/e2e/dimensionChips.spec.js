import { chooseSetting, expect, openDesigner, test } from './fixtures.js';

const dimensions = (page) => page.evaluate(() => window.__banai.store.getState().design.dimensions);
const revision = (page) => page.evaluate(() => window.__banai.store.getState().revision);

test.describe('common-size chips', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('a chip updates the dimension like typing it, and Undo restores it in one step', async ({ page }) => {
    const before = await revision(page);
    await page.getByTestId('dim-width-chip-2400').click();
    await expect.poll(async () => (await dimensions(page)).width).toBe(2400);
    expect(await revision(page)).toBe(before + 1);
    await expect(page.getByTestId('dim-width')).toHaveValue('240.0');
    await expect(page.getByTestId('dim-width-chip-2400')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('dim-width-chip-2000')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('W 240.0 cm', { exact: true })).toBeVisible();
    await page.getByTestId('undo').click();
    await expect.poll(async () => (await dimensions(page)).width).toBe(2000);
  });

  test('the selected chip is pressed and clicking it again changes nothing', async ({ page }) => {
    const chip = page.getByTestId('dim-depth-chip-600');
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    const before = await revision(page);
    await chip.click();
    expect(await revision(page)).toBe(before);
  });

  test('a height the design cannot take is disabled, with the reason', async ({ page }) => {
    const tooLow = page.getByTestId('dim-height-chip-2000');
    await expect(tooLow).toBeDisabled();
    await expect(tooLow).toHaveAttribute('title', /would no longer fit inside/);
    await expect(page.getByTestId('dim-height-chip-2200')).toBeEnabled();
    await tooLow.click({ force: true });
    expect((await dimensions(page)).height).toBe(2400);
  });

  test('a typed size that is not a common one leaves every chip unselected', async ({ page }) => {
    await page.getByTestId('dim-width').fill('213.7');
    await page.getByTestId('dim-width').press('Enter');
    await expect.poll(async () => (await dimensions(page)).width).toBe(2137);
    await expect(page.locator('[data-testid^="dim-width-chip-"][aria-pressed="true"]')).toHaveCount(0);
  });

  test('chip labels follow the selected unit', async ({ page }) => {
    await expect(page.getByTestId('dim-width-chip-2000')).toHaveText('200');
    await chooseSetting(page, 'unit-in');
    await expect(page.getByTestId('dim-width-chip-2000')).toHaveText('78.74');
    await page.getByTestId('dim-width-chip-2400').click();
    await expect.poll(async () => (await dimensions(page)).width).toBe(2400);
  });

  test('a chip clears an earlier inline error and keeps keyboard focus', async ({ page }) => {
    await page.getByTestId('dim-width').fill('abc');
    await page.getByTestId('dim-width').press('Enter');
    await expect(page.getByText('Enter a number in cm, e.g. 64.5')).toBeVisible();
    const chip = page.getByTestId('dim-width-chip-1500');
    await chip.focus();
    await chip.press('Enter');
    await expect.poll(async () => (await dimensions(page)).width).toBe(1500);
    await expect(page.getByText('Enter a number in cm, e.g. 64.5')).toHaveCount(0);
    await expect(page.getByTestId('dim-width-chip-1500')).toBeFocused();
  });
});
