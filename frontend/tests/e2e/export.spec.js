// Carpenter PDF: a real download with pictures rendered from the 3D scene, for the committed design only.
import { readFileSync } from 'node:fs';
import { expect, openDesigner, test } from './fixtures.js';

const camera = (page) => page.evaluate(() => window.__banai.viewer.camera.position.toArray());

async function exportPdf(page, testInfo, name) {
  const download = page.waitForEvent('download');
  await page.getByTestId('export-pdf').click();
  const file = await download;
  const path = testInfo.outputPath(name);
  await file.saveAs(path);
  return { file, bytes: readFileSync(path) };
}

test.describe('Carpenter PDF', () => {
  test('downloads a multi-page PDF with pictures and leaves the editor untouched', async ({ page }, testInfo) => {
    await openDesigner(page);
    const cameraBefore = await camera(page);
    const { file, bytes } = await exportPdf(page, testInfo, 'basic.pdf');

    expect(file.suggestedFilename()).toBe('banai-wardrobe-build-sheet.pdf');
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const text = bytes.toString('latin1');
    expect((text.match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((text.match(/\/Subtype\s*\/Image/g) ?? []).length).toBe(3); // perspective, front, interior
    expect(bytes.length).toBeGreaterThan(40_000); // the pictures are really in there
    expect(await camera(page)).toEqual(cameraBefore); // its own offscreen renderer: the live view is not moved
    await expect(page.getByTestId('export-pdf')).toBeEnabled();
    await expect(page.getByTestId('export-pdf')).toHaveText('Carpenter PDF');
  });

  test('uses the committed design: a wardrobe without doors gets two pictures', async ({ page }, testInfo) => {
    await openDesigner(page);
    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'configure_doors', type: 'none' }]));
    const { bytes } = await exportPdf(page, testInfo, 'no-doors.pdf');
    expect((bytes.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length).toBe(2);
  });
});
