import { readFile } from 'node:fs/promises';
import { expect, openDesigner, test } from './fixtures.js';

// "PDF for your carpenter" (Generate Style Profile) against the real E2E backend (no mocking of the PDF
// endpoint). It opens from the chat; the header's Export is the browser-built specification (export-share.spec.js).

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });

async function openStyleProfile(page) {
  await page.route('**/api/health', (route) => route.fulfill(ok({ status: 'ok', env: 'e2e', agent: true, storage: true })));
  await page.route('**/api/chat', (route) => route.fulfill(ok({
    reply: 'Great! You can download the file for your carpenter.', replySignature: 'c'.repeat(64), proposal: null, offerProfile: true,
  })));
  await openDesigner(page);
  await page.getByTestId('chat-input').fill("I'm done");
  await page.getByTestId('chat-send').click();
  await page.getByTestId('chat-style-profile').click();
  await expect(page.getByTestId('profile-dialog')).toBeVisible();
}

test('Generate Style Profile is not in the properties panel or the header', async ({ page }) => {
  await openDesigner(page);
  await expect(page.getByTestId('chat-style-profile')).toHaveCount(0);
  await expect(page.locator('#properties-panel').getByText('Generate Style Profile')).toHaveCount(0);
  await expect(page.locator('.topbar').getByText('Generate Style Profile')).toHaveCount(0);
});

test('the style profile dialog follows the app language and downloads a real PDF', async ({ page }) => {
  await openStyleProfile(page);
  await expect(page.getByTestId('profile-language')).toHaveValue('en');

  const request = page.waitForRequest('**/api/export/pdf');
  const download = page.waitForEvent('download');
  await page.getByTestId('profile-download').click();
  const sent = (await request).postDataJSON();
  expect(Object.keys(sent).sort()).toEqual(['design', 'image', 'language']);
  expect(sent.image).toMatch(/^data:image\/jpeg;base64,/); // the 3D picture for the PDF's first page
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^[A-Za-z0-9._-]+\.pdf$/);
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  await expect(page.getByTestId('profile-status')).toHaveText('Your PDF is downloading.');
  await page.getByTestId('profile-close').click();
  await expect(page.getByTestId('profile-dialog')).toBeHidden();
});

test('choosing Hebrew sends language he', async ({ page }) => {
  await openStyleProfile(page);
  await page.getByTestId('profile-language').selectOption('he');
  const request = page.waitForRequest('**/api/export/pdf');
  await page.getByTestId('profile-download').click();
  expect((await request).postDataJSON().language).toBe('he');
  await page.waitForEvent('download');
});
