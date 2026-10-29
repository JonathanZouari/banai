import { readFile } from 'node:fs/promises';
import { expect, openDesigner, openStep, test } from './fixtures.js';

// "PDF for your carpenter" against the real E2E backend (no mocking of the PDF endpoint).

test('Generate Style Profile sits next to Add compartment, not in the top bar', async ({ page }) => {
  await openDesigner(page);
  await openStep(page, 'interior'); // the PDF button sits next to "+ Add compartment"
  const button = page.getByTestId('open-export');
  await expect(button).toHaveText('הפקת פרופיל סגנון');
  await expect(page.locator('.button-row').filter({ has: page.getByTestId('add-compartment') }).getByTestId('open-export')).toBeVisible();
  await expect(page.locator('.topbar').getByTestId('open-export')).toHaveCount(0);
  // Side by side on one line, not stacked.
  const add = await page.getByTestId('add-compartment').boundingBox();
  const generate = await button.boundingBox();
  expect(Math.abs(add.y - generate.y)).toBeLessThan(2);
  // ...and after it in reading order: to its left in Hebrew (RTL), to its right in English.
  const rtl = await page.evaluate(() => document.documentElement.dir === 'rtl');
  expect(rtl).toBe(true);
  expect(generate.x + generate.width).toBeLessThan(add.x + 1);
});

test('the export dialog defaults to the chat language and downloads a real PDF', async ({ page }) => {
  await openDesigner(page);
  await openStep(page, 'interior'); // the PDF button sits next to "+ Add compartment"
  await page.getByTestId('open-export').click();
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toBeVisible();
  const chatLanguage = await page.evaluate(() => localStorage.getItem('banai.chat.language'));
  await expect(page.getByTestId('export-language')).toHaveValue(chatLanguage ?? 'he');

  const request = page.waitForRequest('**/api/export/pdf');
  const download = page.waitForEvent('download');
  await page.getByTestId('export-download').click();
  const sent = (await request).postDataJSON();
  expect(Object.keys(sent).sort()).toEqual(['design', 'image', 'language']);
  expect(sent.image).toMatch(/^data:image\/jpeg;base64,/); // the 3D picture for the PDF's first page
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^[A-Za-z0-9._-]+\.pdf$/);
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  await expect(page.getByTestId('export-status')).toHaveText('ה-PDF יורד.');
  await page.getByTestId('export-close').click();
  await expect(dialog).toBeHidden();
});

test('choosing English sends language en', async ({ page }) => {
  await openDesigner(page);
  await openStep(page, 'interior'); // the PDF button sits next to "+ Add compartment"
  await page.getByTestId('open-export').click();
  await page.getByTestId('export-language').selectOption('en');
  const request = page.waitForRequest('**/api/export/pdf');
  await page.getByTestId('export-download').click();
  expect((await request).postDataJSON().language).toBe('en');
  await page.waitForEvent('download');
});

test.describe('Save picture', () => {
  test('downloads the studio picture as a PNG named after the dimensions, without any request', async ({ page }) => {
    await openDesigner(page);
    await openStep(page, 'interior'); // the PDF button sits next to "+ Add compartment"
    await page.getByTestId('open-export').click();
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    const download = page.waitForEvent('download');
    await page.getByTestId('export-picture').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('banai-200x240x60.png');
    const bytes = await readFile(await file.path());
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.length).toBeGreaterThan(5000); // a real render, not an empty canvas
    await expect(page.getByTestId('export-status')).toHaveText('התמונה נשמרה במכשיר.');
    expect(requests.filter((url) => !url.startsWith('blob:'))).toEqual([]); // nothing was sent to the server
  });

  test('the file name follows the current dimensions', async ({ page }) => {
    await openDesigner(page);
    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'update_dimensions', width: 2100, height: 2300 }]));
    await openStep(page, 'interior');
    await page.getByTestId('open-export').click();
    const download = page.waitForEvent('download');
    await page.getByTestId('export-picture').click();
    expect((await download).suggestedFilename()).toBe('banai-210x230x60.png');
  });
});
