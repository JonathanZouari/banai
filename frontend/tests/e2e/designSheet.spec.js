// Wood-tone doors and the illustrative "design sheet" PDF.
import { readFileSync } from 'node:fs';
import { expect, openDesigner, test } from './fixtures.js';

test.describe('wood-tone doors', () => {
  test('a wood tone on the doors makes them veneer with a grain texture in that tone', async ({ page }) => {
    await openDesigner(page);
    // The second appearance block is the doors' (the first is the carcass).
    await page.getByRole('group', { name: 'Wood tones' }).nth(1).getByRole('button', { name: 'Teak' }).click();
    await expect.poll(() => page.evaluate(() => window.__banai.store.getState().design.doors.appearance)).toMatchObject({
      material: { catalogId: 'oak_veneer' }, color: { catalogId: 'teak' },
    });
    const door = await page.evaluate(() => {
      const mesh = window.__banai.viewer.meshOf('dr_left');
      return { hex: mesh.material.color.getHexString(), wood: Boolean(mesh.material.map?.userData.wood) };
    });
    expect(door).toEqual({ hex: 'a8693b', wood: true });
    // The carcass keeps its plain white.
    expect(await page.evaluate(() => window.__banai.viewer.meshOf('carcass').material.map)).toBeNull();
  });
});

test.describe('design sheet (PDF)', () => {
  test('downloads an A4 PDF of the current design', async ({ page }, testInfo) => {
    await openDesigner(page);
    const button = page.getByTestId('export-sheet');
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('title', /אינו שרטוט ייצור|Not a manufacturing drawing/);
    const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
    expect(download.suggestedFilename()).toMatch(/^banai-design-\d{4}-\d{2}-\d{2}\.pdf$/);
    const file = testInfo.outputPath('design-sheet.pdf');
    await download.saveAs(file);
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(20_000); // contains the rendered page image
    await expect(button).toBeEnabled();
    // The user's view is restored: doors still shown, nothing left on screen from the sheet.
    expect(await page.evaluate(() => window.__banai.store.getState().ui.doorsVisible)).toBe(true);
    await expect(page.getByTestId('design-sheet')).toHaveCount(0);
  });
});
