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

// Whether leaving now would be stopped: the page cancels a synthetic beforeunload when unsaved.
const blocksLeaving = (page) => page.evaluate(() => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
});

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });

test.describe('unsaved changes warning', () => {
  test('no warning on open or right after a save; a warning after each manual edit', async ({ page }) => {
    await openDesigner(page);
    const saveButton = page.getByTestId('open-save');
    expect(await blocksLeaving(page)).toBe(false);
    await expect(saveButton).not.toHaveClass(/btn--unsaved/);

    expect(await setHeight(page, 2300)).toBe(true);
    expect(await blocksLeaving(page)).toBe(true);
    await expect(saveButton).toHaveClass(/btn--unsaved/);
    await expect(saveButton).toHaveAttribute('aria-label', 'Save (unsaved changes)');

    await saveFromDialog(page);
    expect(await blocksLeaving(page)).toBe(false);
    await expect(saveButton).not.toHaveClass(/btn--unsaved/);

    expect(await setHeight(page, 2200)).toBe(true);
    expect(await blocksLeaving(page)).toBe(true);
  });

  test('selecting a component or showing the interior is not a change', async ({ page }) => {
    await openDesigner(page);
    await page.evaluate(() => window.__banai.store.select('shf_l1'));
    await page.locator('#toggle-interior').setChecked(false);
    expect(await blocksLeaving(page)).toBe(false);
  });

  test('a confirmed AI proposal is an unsaved change', async ({ page }) => {
    await page.route('**/api/health', (route) => route.fulfill(ok({ status: 'ok', env: 'e2e', agent: true, storage: true })));
    await page.route('**/api/chat', (route) => {
      const body = route.request().postDataJSON();
      return route.fulfill(ok({
        reply: 'Sure! Here is my proposal.',
        proposal: {
          proposalId: 'prp_0123456789abcdef', baseRevision: body.revision, baseHash: 'a'.repeat(64),
          ops: [{ op: 'update_dimensions', depth: 550 }], signature: 'b'.repeat(64),
          summary: 'Makes the wardrobe shallower.', changes: [{ title: 'Depth', detail: '60.0 cm to 55.0 cm' }],
        },
      }));
    });
    await page.route('**/api/proposals/apply', (route) => {
      const body = route.request().postDataJSON();
      const design = structuredClone(body.design);
      design.dimensions.depth = 550;
      return route.fulfill(ok({ design, revision: body.revision + 1 }));
    });
    await openDesigner(page);
    await page.getByTestId('chat-input').fill('55 cm deep please');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('proposal-card')).toBeVisible();
    expect(await blocksLeaving(page)).toBe(false); // a pending proposal is not a change
    await page.getByTestId('proposal-confirm').click();
    await expect(page.getByTestId('proposal-card')).toHaveCount(0);
    expect(await blocksLeaving(page)).toBe(true);
    await expect(page.getByTestId('open-save')).toHaveClass(/btn--unsaved/);
  });

  test('the browser really asks before closing with unsaved changes', async ({ page }) => {
    await openDesigner(page); // the click on the start screen counts as user interaction
    expect(await setHeight(page, 2300)).toBe(true);
    const dialog = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const shown = await dialog;
    expect(shown.type()).toBe('beforeunload');
    await shown.accept();
  });

  test('no warning when the server cannot save', async ({ page }) => {
    await page.route('**/api/health', (route) => route.fulfill(ok({ status: 'ok', env: 'e2e', storage: false })));
    await openDesigner(page);
    expect(await setHeight(page, 2300)).toBe(true);
    expect(await blocksLeaving(page)).toBe(false);
    await expect(page.getByTestId('open-save')).not.toHaveClass(/btn--unsaved/);
  });
});

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

  test.describe('bad links', () => {
    test.use({ allowedConsoleErrors: [/404/] });

    test('a wrong token falls back to the basic wardrobe and says so', async ({ page }) => {
      await page.goto(`/#d=0b6f2a52-3c1e-4c8e-9a51-1f6f3f2b7d10.${'A'.repeat(43)}`);
      await expect(page.locator('#error-banner')).toContainText('did not open a saved design');
      await expect(page.getByTestId('start-screen')).toBeVisible();
    });
  });
});
