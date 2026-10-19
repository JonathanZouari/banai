import { test, expect, openDesigner } from './fixtures.js';

// Soft close and legs (the user's list, 2026-10-19). Choosing legs on a design with no base raises R24 as a
// pop-up; its fix gives the legs 10 cm. Soft close is a switch, on by default.
const store = (page) => page.evaluate(() => window.__banai.store.getState());

test('legs: chosen in the panel, the warning pops up, and its fix sets a 10 cm base', async ({ page }) => {
  await openDesigner(page);
  await page.getByTestId('base-type').getByRole('button', { name: 'רגליות' }).click();
  expect((await store(page)).design.carcass.base).toBe('legs');
  await expect(page.getByTestId('alert-sheet')).toContainText('גובה לא מתאים לרגליות');
  await page.getByTestId('alert-fix').click();
  expect((await store(page)).design.carcass.plinthHeight).toBe(100);
  await expect(page.getByTestId('advice-r24-legs-count')).toContainText('8 רגליות מתכווננות');
  await expect(page.getByRole('textbox', { name: 'גובה הרגליות' })).toHaveValue('10.0');
});

test('soft close is on by default; switching it off is explained, and its fix brings it back', async ({ page }) => {
  await openDesigner(page);
  const toggle = page.getByTestId('soft-close');
  await expect(toggle).toBeChecked();
  await toggle.click({ force: true });
  expect((await store(page)).design.fittings.softClose).toBe(false);
  await expect(page.getByTestId('advice-r24-soft')).toBeVisible();
  await page.getByTestId('advice-fix-r24-soft').click();
  expect((await store(page)).design.fittings.softClose).toBe(true);
});
