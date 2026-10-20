import { test, expect, openDesigner, openChat, reveal } from './fixtures.js';

// Customer details (ADR-038): typed in a clear dialog, saved and opened with the project, cleared by a new one,
// sent with the dossier, and never with a chat turn.
const STORAGE_KEY = 'banai.openaiApiKey';
const KEY = 'sk-test-e2eKey0123456789abcdefWXYZ';
const envelope = (data) => ({
  status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({ success: true, data, error: null }),
});

test('details: checked, kept with the project, in the dossier and never in a chat turn', async ({ page }) => {
  test.setTimeout(90_000); // a long flow, with a menu opened for most steps
  const dossiers = [];
  const chats = [];
  await page.route('**/api/dossier', (route) => {
    dossiers.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Access-Control-Allow-Origin': '*' }, body: '%PDF-1.7 fake' });
  });
  await page.route('**/api/settings/ai/verify', (r) => r.fulfill(envelope({ status: 'connected', model: 'm', maskedKey: 'sk-...WXYZ', checkedAt: 'x' })));
  await page.route('**/api/chat', (route) => {
    chats.push(route.request().postData());
    return route.fulfill(envelope({ reply: 'שלום', model: 'gpt-test-mini' }));
  });
  await page.addInitScript(([name, key]) => localStorage.setItem(name, key), [STORAGE_KEY, KEY]);
  await openDesigner(page);

  await reveal(page, 'open-dossier');
  await page.getByTestId('open-dossier').click();
  await expect(page.getByTestId('dossier-customer-note')).toBeVisible();
  await reveal(page, 'open-dossier');
  await page.getByTestId('open-dossier').click();

  await reveal(page, 'open-customer');
  await page.getByTestId('open-customer').click();
  const dialog = page.getByTestId('customer-dialog');
  await expect(dialog).toBeVisible();
  await page.getByTestId('customer-name').fill('דנה לוי');
  await page.getByTestId('customer-phone').fill('call me');
  await page.getByTestId('customer-save').click();
  await expect(page.getByTestId('customer-error')).toContainText('מספר טלפון');
  await expect(page.getByTestId('customer-phone')).toBeFocused();
  await page.getByTestId('customer-phone').fill('052-1234567');
  await page.getByTestId('customer-floor').fill('4');
  await page.getByTestId('customer-elevator').selectOption('no');
  await page.getByTestId('customer-save').click();
  await expect(dialog).toBeHidden();

  await reveal(page, 'open-dossier');
  await page.getByTestId('open-dossier').click();
  await expect(page.getByTestId('dossier-customer-note')).toBeHidden();
  await reveal(page, 'dossier-he');
  await page.getByTestId('dossier-he').click();
  await expect.poll(() => dossiers.length).toBe(1);
  expect(dossiers[0].customer).toEqual({ name: 'דנה לוי', phone: '052-1234567', floor: 4, elevator: false });

  await openChat(page);
  await page.getByTestId('chat-input').fill('איזה ארון מתאים?');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-bubble-assistant')).toHaveText('שלום');
  expect(chats[0]).not.toContain('דנה');
  expect(chats[0]).not.toContain('052-1234567'); // the full number: the test key itself has digits in a row

  // Saved with the project; a new project starts without them; opening the project brings them back.
  await page.getByTestId('open-save').click();
  await page.getByTestId('project-name').fill('חדר של דנה');
  await page.getByTestId('save-confirm').click();
  await page.getByTestId('save-close').click();
  await reveal(page, 'new-project');
  await page.getByTestId('new-project').click();
  await page.getByTestId('entry-basic').click(); // a new project starts at the start screen
  await reveal(page, 'open-customer');
  await page.getByTestId('open-customer').click();
  await expect(page.getByTestId('customer-name')).toHaveValue('');
  await page.getByTestId('customer-cancel').click();
  await reveal(page, 'open-project');
  await page.getByTestId('open-project').click();
  await page.getByTestId('project-item').filter({ hasText: 'חדר של דנה' }).getByRole('button', { name: 'פתיחה' }).click();
  await reveal(page, 'open-customer');
  await page.getByTestId('open-customer').click();
  await expect(page.getByTestId('customer-name')).toHaveValue('דנה לוי');
  await expect(page.getByTestId('customer-elevator')).toHaveValue('no');
});
