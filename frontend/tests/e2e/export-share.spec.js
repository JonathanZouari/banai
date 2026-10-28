import { readFileSync } from 'node:fs';
import { expect, openDesigner, test } from './fixtures.js';

const exportPdf = async (page) => {
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-download').click();
  return download;
};

test.describe('Save, Export and Share in the header', () => {
  test('Save and Export carry equal weight, and Share replaces Copy share link', async ({ page }) => {
    await openDesigner(page);
    const save = page.getByTestId('open-save');
    const exporter = page.getByTestId('open-export');
    const share = page.getByTestId('share-menu');
    const [a, b, c] = await Promise.all([save.boundingBox(), exporter.boundingBox(), share.boundingBox()]);
    expect(Math.abs(a.height - b.height)).toBeLessThan(1);
    expect(Math.abs(a.height - c.height)).toBeLessThan(1);
    const background = (locator) => locator.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(await background(exporter)).toBe(await background(save));
    expect(await background(share)).toBe(await background(save));
    await expect(page.getByTestId('menu-copy-link')).toHaveCount(0);
    await expect(page.getByTestId('more-menu')).toHaveCount(0);
    await expect(page.getByTestId('open-render')).toBeVisible();
  });

  test('Share lists Copy link, WhatsApp and Email, all disabled with a reason until a link exists', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('share-menu').click();
    const panel = page.getByTestId('share-panel');
    await expect(panel).toBeVisible();
    for (const id of ['share-copy', 'share-whatsapp', 'share-email']) await expect(page.getByTestId(id)).toBeDisabled();
    await expect(page.getByTestId('share-note')).toContainText('Sharing needs a saved design');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('Share works once a link is set: copy, WhatsApp and email', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openDesigner(page);
    await page.evaluate(() => { window.__opened = []; window.open = (url) => { window.__opened.push(url); return null; }; });
    const link = `${new URL(page.url()).origin}/#d=abc.secret-token`;
    await page.evaluate((url) => window.__banai.share.setLink(url), link);
    await page.getByTestId('share-menu').click();
    await expect(page.getByTestId('share-note')).toBeHidden();
    await page.getByTestId('share-copy').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await page.getByTestId('share-menu').click();
    await page.getByTestId('share-whatsapp').click();
    await page.getByTestId('share-menu').click();
    await page.getByTestId('share-email').click();
    const opened = await page.evaluate(() => window.__opened);
    expect(opened).toHaveLength(2);
    expect(decodeURIComponent(opened[0])).toContain(link);
    expect(opened[0].startsWith('https://wa.me/?text=')).toBe(true);
    expect(opened[1].startsWith('mailto:?subject=')).toBe(true);
  });

  test('a link to another origin is refused, so sharing stays off', async ({ page }) => {
    await openDesigner(page);
    await page.evaluate(() => window.__banai.share.setLink('https://evil.example/#d=x.y'));
    await page.getByTestId('share-menu').click();
    await expect(page.getByTestId('share-copy')).toBeDisabled();
  });
});

test.describe('Export PDF', () => {
  test('downloads a real PDF named after the design', async ({ page }) => {
    await openDesigner(page);
    const download = await exportPdf(page);
    expect(download.suggestedFilename()).toMatch(/^BanAI-wardrobe-2000x2400x600-\d{8}\.pdf$/);
    const bytes = readFileSync(await download.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(100_000); // includes the two 3D views and the embedded font
    expect((bytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(6);
    await expect(page.getByTestId('export-status')).toHaveText('Your PDF was downloaded.');
  });

  test('exporting never changes the design or its history', async ({ page }) => {
    await openDesigner(page);
    const before = await page.evaluate(() => JSON.stringify(window.__banai.store.getState().design));
    const revision = await page.evaluate(() => window.__banai.store.getState().revision);
    await exportPdf(page);
    expect(await page.evaluate(() => JSON.stringify(window.__banai.store.getState().design))).toBe(before);
    expect(await page.evaluate(() => window.__banai.store.getState().revision)).toBe(revision);
    await expect(page.getByTestId('undo')).toBeDisabled();
  });

  test('uses the selected language and units, and the current design', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('settings-menu').click();
    await page.getByTestId('lang-he').click();
    await page.getByTestId('unit-in').click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'update_dimensions', width: 2400 }]));
    const download = await exportPdf(page);
    expect(download.suggestedFilename()).toMatch(/^BanAI-wardrobe-2400x2400x600-\d{8}\.pdf$/);
    await expect(page.getByTestId('export-status')).toHaveText('ה-PDF הורד.');
    expect(readFileSync(await download.path()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('the dialog is localized and can be closed', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('settings-menu').click();
    await page.getByTestId('lang-he').click();
    await page.keyboard.press('Escape');
    await page.getByTestId('open-export').click();
    await expect(page.getByTestId('export-dialog')).toContainText('ייצוא מפרט ב-PDF');
    await page.getByTestId('export-close').click();
    await expect(page.getByTestId('export-dialog')).toBeHidden();
  });

  test('reports a failure instead of hanging when the font is unusable', async ({ page }) => {
    await openDesigner(page);
    await page.route('**/fonts/*.ttf', (route) => route.fulfill({ status: 200, contentType: 'font/ttf', body: 'not a font' }));
    await page.getByTestId('open-export').click();
    await page.getByTestId('export-download').click();
    await expect(page.getByTestId('export-status')).toHaveText('The PDF could not be created. Please try again.');
    await expect(page.getByTestId('export-download')).toBeEnabled();
  });
});
