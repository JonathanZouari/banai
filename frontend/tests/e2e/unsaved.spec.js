import { expect, openDesigner, openDesignerLoggedIn, test } from './fixtures.js';

const setHeight = (page, height) => page.evaluate(
  (value) => window.__banai.store.dispatch([{ op: 'update_dimensions', height: value }]).ok,
  height,
);

/** Closes the page with beforeunload handlers run; resolves to the prompt's type, or null if none. */
async function closePrompt(page) {
  const prompted = page.waitForEvent('dialog', { timeout: 2000 }).then((dialog) => {
    const type = dialog.type();
    dialog.dismiss(); // stay on the page
    return type;
  }).catch(() => null);
  await page.close({ runBeforeUnload: true });
  return prompted;
}

test.describe('unsaved changes', () => {
  test('a fresh design has no dot and closes without a prompt', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByTestId('save-dot')).toBeHidden();
    expect(await closePrompt(page)).toBeNull();
  });

  test('an edit shows the dot and the browser asks before closing', async ({ page }) => {
    await openDesigner(page);
    expect(await setHeight(page, 2300)).toBe(true);
    await expect(page.getByTestId('save-dot')).toBeVisible();
    await expect(page.getByTestId('open-save')).toHaveAccessibleName('Save (unsaved changes)');
    expect(await closePrompt(page)).toBe('beforeunload');
    await expect(page.getByTestId('open-save')).toBeVisible(); // dismissed: still on the page
  });

  test('editing back to the saved value clears the dot', async ({ page }) => {
    await openDesigner(page);
    await setHeight(page, 2300);
    await expect(page.getByTestId('save-dot')).toBeVisible();
    await setHeight(page, 2400);
    await expect(page.getByTestId('save-dot')).toBeHidden();
  });

  test('saving to the link clears the dot and the prompt; a later edit brings them back', async ({ page }) => {
    await openDesignerLoggedIn(page);
    await setHeight(page, 2300);
    await page.getByTestId('open-save').click();
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('share-link')).toHaveValue(/#d=/);
    await page.getByTestId('save-close').click();
    await expect(page.getByTestId('save-dot')).toBeHidden();

    await setHeight(page, 2200);
    await expect(page.getByTestId('save-dot')).toBeVisible();
  });

  test('switching to a ready-made example counts as an unsaved change', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('open-presets').click();
    await page.getByTestId('preset-open-kids').click();
    await expect(page.getByTestId('save-dot')).toBeVisible();
  });
});
