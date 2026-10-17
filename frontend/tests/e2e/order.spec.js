import { readFile } from 'node:fs/promises';
import { expect, openDesigner, test } from './fixtures.js';

test.describe('finish order and cabinetmaker sheet', () => {
  test('confirming is required before the sheet; the sheet downloads as a real PDF', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByTestId('open-maker')).toBeHidden();
    await page.getByTestId('open-finish').click();
    const dialog = page.getByTestId('finish-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('dir', 'rtl');
    await expect(dialog).toContainText('200.0 × 240.0 × 60.0');
    await expect(dialog).toContainText('לעגן לקיר'); // the common-practice findings are shown to the customer too
    await expect(page.getByTestId('finish-confirm')).toBeDisabled();

    await page.getByTestId('finish-agree').check();
    await page.getByTestId('finish-confirm').click();
    await expect(dialog).toContainText('ההזמנה הושלמה');
    await expect(page.getByTestId('open-maker')).toBeVisible();

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByTestId('finish-sheet').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^banai-cabinetmaker-\d{4}-\d{2}-\d{2}\.pdf$/);
    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(20_000);
    expect((bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(3);
  });

  test('editing the design after finishing withdraws the sheet until confirmed again', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('open-finish').click();
    await page.getByTestId('finish-agree').check();
    await page.getByTestId('finish-confirm').click();
    await page.getByTestId('finish-close').click();
    await expect(page.getByTestId('open-maker')).toBeVisible();

    await page.getByTestId('dim-width').fill('210');
    await page.getByTestId('dim-width').press('Enter');
    await expect(page.getByTestId('open-maker')).toBeHidden();
    await page.getByTestId('open-finish').click();
    await expect(page.getByTestId('finish-confirm')).toBeVisible(); // back to review
    await expect(page.getByTestId('finish-dialog')).toContainText('210.0 × 240.0');
  });
});
