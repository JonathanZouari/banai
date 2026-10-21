import { expect, openDesigner, test } from './fixtures.js';

test.describe('confirm order and carpenter PDF', () => {
  test('the PDF button appears only after confirming; the design is locked; the PDF downloads', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByTestId('download-pdf')).toBeHidden();

    await page.getByTestId('open-order').click();
    await expect(page.getByTestId('order-dialog')).toBeVisible();
    await expect(page.getByTestId('order-summary')).toContainText('2000 x 2400 x 600');
    // Backing out changes nothing.
    await page.getByTestId('order-back').click();
    await expect(page.getByTestId('order-banner')).toBeHidden();

    await page.getByTestId('open-order').click();
    await page.getByTestId('order-confirm').click();
    await expect(page.getByTestId('order-banner')).toBeVisible();
    await expect(page.getByTestId('download-pdf')).toBeVisible();

    // Locked: edits are refused and the panels are inert.
    const locked = await page.evaluate(() => {
      const result = window.__banai.store.dispatch([{ op: 'update_dimensions', width: 2100 }]);
      return { ok: result.ok, code: result.error?.code, width: window.__banai.store.getState().design.dimensions.width };
    });
    expect(locked).toEqual({ ok: false, code: 'ORDER_LOCKED', width: 2000 });
    await expect(page.locator('#properties-panel')).toHaveAttribute('inert', '');

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-pdf').click()]);
    expect(download.suggestedFilename()).toMatch(/^banai-wardrobe-\d{4}-\d{2}-\d{2}\.pdf$/);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(20_000);

    // Edit again unlocks and hides the PDF button until the next confirmation.
    await page.getByTestId('order-edit-again').click();
    await expect(page.getByTestId('order-banner')).toBeHidden();
    await expect(page.locator('#properties-panel')).not.toHaveAttribute('inert', '');
    const unlocked = await page.evaluate(() => window.__banai.store.dispatch([{ op: 'update_dimensions', width: 2100 }]).ok);
    expect(unlocked).toBe(true);
  });
});
