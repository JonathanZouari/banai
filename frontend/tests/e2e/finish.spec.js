// Finish design -> carpenter PDF (scope change 2026-10-20). The PDF comes from the real E2E
// backend, built from the validated design and two snapshots of the 3D view.
import { readFileSync } from 'node:fs';
import { expect, openDesigner, test } from './fixtures.js';

const state = (page) => page.evaluate(() => {
  const { design, revision, finalized } = window.__banai.store.getState();
  return { design, revision, finalized };
});

test.describe('finish design and carpenter PDF', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('Cancel keeps the design editable', async ({ page }) => {
    await page.getByTestId('open-finish').click();
    const dialog = page.getByTestId('finish-dialog');
    await expect(dialog.getByText('200.0 cm × 240.0 cm × 60.0 cm')).toBeVisible();
    await expect(dialog.getByText('Finishing locks the design')).toBeVisible();
    await page.getByTestId('finish-cancel').click();
    expect((await state(page)).finalized).toBeNull();
    expect(await page.evaluate(() => document.getElementById('properties-panel').inert)).toBe(false);
  });

  test('finishing locks editing and the PDF downloads', async ({ page }) => {
    await page.getByTestId('open-finish').click();
    await page.getByTestId('finish-confirm').click();

    // Locked: the store refuses edits and both editing panels are inert.
    const { revision, finalized } = await state(page);
    expect(finalized.revision).toBe(revision);
    const result = await page.evaluate(() => window.__banai.store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 450 }]));
    expect(result.ok).toBe(false);
    for (const id of ['properties-panel', 'chat-panel']) {
      expect(await page.evaluate((panelId) => document.getElementById(panelId).inert, id)).toBe(true);
    }
    await expect(page.getByText('This design is finished and locked.')).toBeVisible();
    await expect(page.getByTestId('finished-chip')).toBeVisible();
    await expect(page.getByTestId('open-finish')).toBeHidden();

    // Download in English (the language can be chosen in the dialog).
    await page.getByTestId('pdf-language').selectOption('en');
    const downloadEvent = page.waitForEvent('download');
    await page.getByTestId('download-pdf').click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(`banai-carpenter-r${revision}.pdf`);
    const pdf = readFileSync(await download.path());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(20_000); // includes the two 3D snapshots
    await expect(page.getByText('The PDF was downloaded.')).toBeVisible();

    // The view state is restored and the design is unchanged.
    const after = await state(page);
    expect(after.revision).toBe(revision);
  });

  test('the PDF button reopens the download step after closing', async ({ page }) => {
    await page.getByTestId('open-finish').click();
    await page.getByTestId('finish-confirm').click();
    await page.getByTestId('finish-close').click();
    await page.getByTestId('open-pdf').click();
    await expect(page.getByTestId('download-pdf')).toBeVisible();
  });
});
