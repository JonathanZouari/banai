import { test, expect, openDesigner } from './fixtures.js';

// "Last designs": designs kept only in this browser (localStorage). Each test gets a fresh browser context.
const archiveCount = (page) => page.evaluate(() => window.__banai.archive.list().length);
const setHeight = (page, height) => page.evaluate(
  (value) => window.__banai.store.dispatch([{ op: 'update_dimensions', height: value }]).ok,
  height,
);

/** Edits the design and waits until the archive holds it. */
async function makeEntry(page, height) {
  await openDesigner(page);
  expect(await setHeight(page, height)).toBe(true);
  await page.waitForFunction(() => window.__banai.archive.list().length >= 1);
}

async function openArchive(page) {
  await page.goto('/');
  await page.getByTestId('entry-archive').click();
  await expect(page.getByTestId('archive-dialog')).toBeVisible();
}

test.describe('last designs archive', () => {
  test('shows an empty state when nothing has been kept', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('archive-count')).toBeHidden();
    await page.getByTestId('entry-archive').click();
    await expect(page.getByTestId('archive-empty')).toBeVisible();
    await expect(page.getByTestId('archive-row')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('archive-dialog')).toBeHidden();
    await expect(page.getByTestId('start-screen')).toBeVisible(); // Esc returns to the start screen
  });

  test('an untouched design is not kept', async ({ page }) => {
    await openDesigner(page);
    await page.waitForTimeout(1200);
    expect(await archiveCount(page)).toBe(0);
  });

  test('a design is kept after editing, listed with date and measurements, and survives a reload', async ({ page }) => {
    await makeEntry(page, 2300);
    await page.reload();
    await expect(page.getByTestId('archive-count')).toHaveText('1');
    await page.getByTestId('entry-archive').click();
    const row = page.getByTestId('archive-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('230.0'); // height in cm
    await expect(row).toContainText(/Edited .*2026/);
    await expect(row).toContainText('compartments');
  });

  test('picking a design shows its details, and Open restores it without undo history', async ({ page }) => {
    await makeEntry(page, 2300);
    await page.reload();
    await page.getByTestId('entry-archive').click();
    await page.getByTestId('archive-row').click();
    const dialog = page.getByTestId('archive-dialog');
    await expect(dialog.locator('.archive__facts')).toContainText('Created');
    await expect(dialog.locator('.archive__facts')).toContainText('Last edited');
    await expect(dialog.locator('.archive__facts')).toContainText('230.0');
    await page.getByTestId('archive-back').click();
    await expect(page.getByTestId('archive-row')).toHaveCount(1);
    await page.getByTestId('archive-row').click();
    await page.getByTestId('archive-open').click();
    await expect(page.getByTestId('start-screen')).toHaveCount(0);
    await expect(dialog).toBeHidden();
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
    expect(await page.evaluate(() => window.__banai.store.getState().design.dimensions.height)).toBe(2300);
    await expect(page.getByTestId('undo')).toBeDisabled();
  });

  test('editing an opened design updates its entry instead of adding a new one', async ({ page }) => {
    await makeEntry(page, 2300);
    await page.reload();
    await page.getByTestId('entry-archive').click();
    await page.getByTestId('archive-row').click();
    await page.getByTestId('archive-open').click();
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
    expect(await setHeight(page, 2200)).toBe(true);
    await page.waitForFunction(() => window.__banai.archive.list()[0].design.dimensions.height === 2200);
    expect(await archiveCount(page)).toBe(1);
  });

  test('a new start is kept as a separate design', async ({ page }) => {
    await makeEntry(page, 2300);
    await page.reload();
    await page.getByTestId('entry-basic').click();
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
    expect(await setHeight(page, 2100)).toBe(true);
    await page.waitForFunction(() => window.__banai.archive.list().length === 2);
  });

  test('Remove asks first, Cancel keeps the design, and removing the last one shows the empty state', async ({ page }) => {
    await makeEntry(page, 2300);
    await openArchive(page);
    await page.getByTestId('archive-row-remove').click();
    await expect(page.getByTestId('archive-confirm-remove')).toBeVisible();
    await expect(page.getByTestId('archive-cancel-remove')).toBeFocused();
    await page.getByTestId('archive-cancel-remove').click();
    await expect(page.getByTestId('archive-row')).toHaveCount(1);
    expect(await archiveCount(page)).toBe(1);

    await page.getByTestId('archive-row-remove').click();
    await page.getByTestId('archive-confirm-remove').click();
    await expect(page.getByTestId('archive-empty')).toBeVisible();
    expect(await archiveCount(page)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('archive-count')).toBeHidden();
  });

  test('Remove from the detail view returns to the list', async ({ page }) => {
    await makeEntry(page, 2300);
    await page.evaluate(() => window.__banai.archive.upsert(null, window.__banai.store.getState().design));
    await openArchive(page);
    await expect(page.getByTestId('archive-row')).toHaveCount(2);
    await page.getByTestId('archive-row').first().click();
    await page.getByTestId('archive-remove').click();
    await page.getByTestId('archive-confirm-remove').click();
    await expect(page.getByTestId('archive-row')).toHaveCount(1);
  });

  test('a design this version cannot open says so and can be removed', async ({ page }) => {
    await openDesigner(page);
    await page.evaluate(() => {
      const broken = structuredClone(window.__banai.store.getState().design);
      broken.dimensions.width = 5000; // passes the shape check, fails the domain rules (width invariant)
      window.__banai.archive.upsert(null, broken);
    });
    await openArchive(page);
    await page.getByTestId('archive-row').click();
    await page.getByTestId('archive-open').click();
    await expect(page.getByTestId('archive-cannot-open')).toBeVisible();
    await expect(page.getByTestId('archive-open')).toBeDisabled();
    await expect(page.getByTestId('start-screen')).toBeVisible();
    await page.getByTestId('archive-remove').click();
    await page.getByTestId('archive-confirm-remove').click();
    await expect(page.getByTestId('archive-empty')).toBeVisible();
  });

  test('corrupt stored data shows the empty state and does not break the app', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('banai.archive.v1', '{not json'));
    await openArchive(page);
    await expect(page.getByTestId('archive-empty')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('entry-basic').click();
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
  });

  test('blocked storage shows that the list is unavailable, and designing still works', async ({ page }) => {
    await page.addInitScript(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function guarded(key, value) {
        if (String(key).startsWith('banai.archive')) throw new DOMException('blocked', 'SecurityError');
        return set.call(this, key, value);
      };
    });
    await openArchive(page);
    await expect(page.getByTestId('archive-unavailable')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('entry-basic').click();
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
    expect(await setHeight(page, 2300)).toBe(true);
    await expect(page.locator('#chat-panel')).toContainText(/could not keep your latest changes/i);
  });

  test('the list follows changes made in another tab', async ({ page, context }) => {
    await makeEntry(page, 2300);
    const first = await context.newPage();
    await first.goto('/');
    await first.getByTestId('entry-archive').click();
    await expect(first.getByTestId('archive-row')).toHaveCount(1);
    await page.evaluate(() => window.__banai.archive.list().forEach((e) => window.__banai.archive.remove(e.id)));
    await expect(first.getByTestId('archive-empty')).toBeVisible();
  });

  test('in Hebrew the dialog is right-to-left, and measurements follow the unit', async ({ page }) => {
    await makeEntry(page, 2300);
    await page.evaluate(() => { localStorage.setItem('banai.language', 'he'); localStorage.setItem('banai.units', 'in'); });
    await page.reload();
    await page.getByTestId('entry-archive').click();
    const dialog = page.getByTestId('archive-dialog');
    await expect(dialog).toHaveAttribute('dir', 'rtl');
    await expect(dialog).toContainText('תכנונים אחרונים');
    await expect(page.getByTestId('archive-row')).toContainText('90.55'); // 2300 mm in inches
  });

  test('the archive never stores a share link or token', async ({ page }) => {
    await makeEntry(page, 2300);
    await page.getByTestId('open-save').click();
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('share-link')).toHaveValue(/#d=/);
    expect(await setHeight(page, 2250)).toBe(true);
    await page.waitForFunction(() => window.__banai.archive.list()[0].design.dimensions.height === 2250);
    const raw = await page.evaluate(() => localStorage.getItem('banai.archive.v1'));
    expect(raw).not.toMatch(/#d=|token/i);
  });
});
