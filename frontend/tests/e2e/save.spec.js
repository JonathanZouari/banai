import { test, expect, openDesigner } from './fixtures.js';

// The E2E backend runs without Supabase keys, so saved designs live in its in-memory store.
const LINK = /#d=[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/;

async function saveFromDialog(page) {
  await page.getByTestId('open-save').click();
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('share-link')).toHaveValue(LINK);
  const link = await page.getByTestId('share-link').inputValue();
  await page.getByTestId('save-close').click();
  return link;
}

const setHeight = (page, height) => page.evaluate(
  (value) => window.__banai.store.dispatch([{ op: 'update_dimensions', height: value }]).ok,
  height,
);

test.describe('save and reopen', () => {
  test('Save gives a private link that reopens the same design', async ({ page, context }) => {
    await openDesigner(page);
    expect(await setHeight(page, 2300)).toBe(true);
    const link = await saveFromDialog(page);
    await expect(page).toHaveURL(LINK);

    const reopened = await context.newPage();
    await reopened.goto(link);
    await reopened.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
    await expect(reopened.getByTestId('start-screen')).toHaveCount(0);
    expect(await reopened.evaluate(() => window.__banai.store.getState().design.dimensions.height)).toBe(2300);
    await reopened.getByTestId('open-save').click();
    await expect(reopened.getByTestId('share-link')).toHaveValue(link);
  });

  test('saving again writes over the same link', async ({ page, context }) => {
    await openDesigner(page);
    const link = await saveFromDialog(page);
    expect(await setHeight(page, 2200)).toBe(true);
    expect(await saveFromDialog(page)).toBe(link);

    const reopened = await context.newPage();
    await reopened.goto(link);
    await reopened.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
    expect(await reopened.evaluate(() => window.__banai.store.getState().design.dimensions.height)).toBe(2200);
  });

  test.describe('conflicts', () => {
    test.use({ allowedConsoleErrors: [/409/] });

    test('a save from an outdated copy is refused, not silently overwritten', async ({ page, context }) => {
      await openDesigner(page);
      const link = await saveFromDialog(page);
      const other = await context.newPage();
      await other.goto(link);
      await other.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
      await saveFromDialog(other);

      await page.getByTestId('open-save').click();
      await page.getByTestId('save-confirm').click();
      await expect(page.getByTestId('save-status')).toContainText('נשמר בינתיים');
    });
  });

  test.describe('saved in this browser', () => {
    const startPage = async (context) => {
      const start = await context.newPage();
      await start.goto('/');
      await expect(start.getByTestId('start-screen')).toBeVisible();
      return start;
    };

    test('the start screen lists a saved design with its size and date, and opens it', async ({ page, context }) => {
      const fresh = await startPage(context);
      await expect(fresh.getByTestId('recent-designs')).toHaveCount(0);

      await openDesigner(page);
      expect(await setHeight(page, 2300)).toBe(true);
      const link = await saveFromDialog(page);

      const start = await startPage(context);
      const row = start.getByTestId('recent-open');
      await expect(row).toHaveCount(1);
      await expect(row).toContainText('200.0 × 230.0 × 60.0 cm');
      await expect(row).toContainText('Saved');
      await expect(row).not.toContainText(link.split('.').pop()); // the token is never shown

      await row.click();
      await start.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
      await expect(start.getByTestId('start-screen')).toHaveCount(0);
      expect(start.url()).toBe(link);
      expect(await start.evaluate(() => window.__banai.store.getState().design.dimensions.height)).toBe(2300);
    });

    test('"Remove from list" forgets the link in this browser', async ({ page, context }) => {
      await openDesigner(page);
      await saveFromDialog(page);

      const start = await startPage(context);
      await start.getByTestId('recent-remove').click();
      await expect(start.getByTestId('recent-designs')).toHaveCount(0);
      await expect(start.getByTestId('entry-guided')).toBeFocused();
      await start.reload();
      await expect(start.getByTestId('start-screen')).toBeVisible();
      await expect(start.getByTestId('recent-designs')).toHaveCount(0);
    });

    test.describe('a link that no longer exists', () => {
      test.use({ allowedConsoleErrors: [/404/] });

      test('shows a friendly message and is removed from the list', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.setItem('banai.recentDesigns', JSON.stringify([{
          designId: '0b6f2a52-3c1e-4c8e-9a51-1f6f3f2b7d10',
          token: 'A'.repeat(43),
          savedAt: '2026-10-20T10:00:00.000Z',
          dimensions: { width: 2000, height: 2400, depth: 600 },
        }])));
        await page.reload();
        await page.getByTestId('recent-open').click();

        await expect(page.locator('#error-banner')).toContainText('no longer exists, so it was removed from your list');
        await expect(page.getByTestId('start-screen')).toBeVisible();
        await expect(page.getByTestId('recent-designs')).toHaveCount(0);
        expect(await page.evaluate(() => localStorage.getItem('banai.recentDesigns'))).toBe('[]');
      });
    });
  });

  test.describe('bad links', () => {
    test.use({ allowedConsoleErrors: [/404/] });

    test('a wrong token falls back to the basic wardrobe and says so', async ({ page }) => {
      await page.goto(`/#d=0b6f2a52-3c1e-4c8e-9a51-1f6f3f2b7d10.${'A'.repeat(43)}`);
      await expect(page.locator('#error-banner')).toContainText('no longer exists');
      await expect(page.getByTestId('start-screen')).toBeVisible();
    });
  });
});
