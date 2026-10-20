import { test, expect, openDesigner } from './fixtures.js';

// A wardrobe with a screen (the user's list, 2026-10-19): a sample flat screen on the back of a compartment,
// sized in inches. By default it is the largest up to 43" that leaves air beside it; a size too large for its
// compartment pops up R25 with the largest screen that fits as the fix.
const store = (page) => page.evaluate(() => window.__banai.store.getState());
const screenOf = async (page) => (await store(page)).design.compartments[1].inserts.find((x) => x.type === 'tv');

test('a screen goes into a compartment, its size is picked in inches, and a screen too wide pops up a fix', async ({ page }) => {
  await openDesigner(page);
  await page.evaluate(() => window.__banai.store.dispatch([{ op: 'update_dimensions', width: 3000 }])); // ~98 cm compartments
  await page.getByTestId('select-cmp_middle').click();
  await page.getByTestId('insert-tv').click();
  await expect.poll(async () => (await screenOf(page))?.height).toBe(436); // 35": 10 cm of air each side
  const { id } = await screenOf(page);
  await expect(page.locator(`[data-testid^="advice-r25-screen-"]`)).toContainText('מסך 35 אינץ׳ בתא 2');

  await page.evaluate((insertId) => window.__banai.store.select(insertId), id);
  await page.getByTestId('screen-size').selectOption('65');
  await expect.poll(async () => (await screenOf(page)).height).toBe(809);
  await expect(page.getByTestId('alert-sheet')).toContainText('המסך רחב מהתא');
  await expect(page.getByTestId('alert-fix')).toHaveText('מסך 35 אינץ׳');
  await page.getByTestId('alert-fix').click();
  await expect.poll(async () => (await screenOf(page)).height).toBe(436);
});
