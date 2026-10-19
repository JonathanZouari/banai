import { readFileSync } from 'node:fs';
import { expect, openDesigner, test } from './fixtures.js';

const committed = (page) => page.evaluate(() => {
  const { design, revision } = window.__banai.store.getState();
  return JSON.stringify({ design, revision });
});

async function exportPdf(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-carpenter-pdf').click()]);
  const text = readFileSync(await download.path()).toString('latin1');
  return { filename: download.suggestedFilename(), text };
}

test.describe('carpenter PDF (proposal)', () => {
  test('downloads a multi-page PDF and leaves the design unchanged', async ({ page }) => {
    await openDesigner(page);
    const before = await committed(page);
    const { filename, text } = await exportPdf(page);
    expect(filename).toBe('banai-carpenter-instructions.pdf');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text.match(/\/Type \/Page /g).length).toBeGreaterThanOrEqual(4);
    expect(await committed(page)).toBe(before);
    await expect(page.getByTestId('export-carpenter-pdf')).toBeEnabled();
  });

  test('exports in English after a manual edit and with sliding doors', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('banai.chat.language', 'en'));
    await openDesigner(page);
    await page.getByTestId('door-type').getByRole('button', { name: 'Sliding' }).click();
    await expect.poll(() => page.evaluate(() => window.__banai.store.getState().design.doors.type)).toBe('sliding');
    const { text } = await exportPdf(page);
    expect(text.match(/\/Type \/Page /g).length).toBeGreaterThanOrEqual(4);
    await expect(page.locator('#error-banner')).toBeHidden();
  });
});
