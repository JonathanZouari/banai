import { test, expect, openChat } from './fixtures.js';

// bobHabanai Day 4 (ADR-029): the conversation's language. Picked on the start screen or in the chat header,
// it switches the chat column's texts and direction, travels with every agent turn, marks the dossier menu,
// and is remembered. The rest of the workspace stays Hebrew.
const STORAGE_KEY = 'banai.openaiApiKey';
const KEY = 'sk-test-e2eKey0123456789abcdefWXYZ';
const envelope = (data) => ({
  status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({ success: true, data, error: null }),
});

test('the session language: Russian from the start screen, then Arabic from the header, remembered on reload', async ({ page }) => {
  const turns = [];
  await page.route('**/api/settings/ai/verify', (r) => r.fulfill(envelope({ status: 'connected', model: 'm', maskedKey: 'sk-...WXYZ', checkedAt: 'x' })));
  await page.route('**/api/chat', async (route) => {
    turns.push(route.request().postDataJSON());
    await route.fulfill(envelope({ reply: 'Привет! Я Боб-строитель.', model: 'gpt-test-mini' }));
  });
  await page.addInitScript(([name, key]) => localStorage.setItem(name, key), [STORAGE_KEY, KEY]);

  await page.goto('/');
  await page.getByTestId('start-language-ru').click();
  await expect(page.getByTestId('start-language-ru')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('entry-basic').click();
  await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
  await openChat(page);

  const column = page.locator('#chat-body');
  await expect(column).toHaveAttribute('dir', 'ltr');
  await expect(column).toHaveAttribute('lang', 'ru');
  await expect(page.getByTestId('chat-language')).toHaveValue('ru');
  await expect(page.getByTestId('chat-input')).toHaveAttribute('placeholder', 'Напишите Бобу…');
  await expect(column.locator('.chat__title')).toHaveText('Боб-строитель');
  await expect(page.getByTestId('chat-status')).toHaveText('Ключ подключён');
  // The workspace itself stays Hebrew.
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('open-dossier')).toHaveText('תיק נגר');
  await expect(page.getByTestId('dossier-ru')).toHaveAttribute('aria-current', 'true');

  await page.getByTestId('chat-input').fill('Какой шкаф лучше для спальни?');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-bubble-assistant')).toHaveText('Привет! Я Боб-строитель.');
  expect(turns[0].language).toBe('ru');

  await page.getByTestId('chat-language').selectOption('ar');
  await expect(column).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('chat-input')).toHaveAttribute('placeholder', 'اكتب إلى بوب…');
  await expect(page.getByTestId('dossier-ar')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('dossier-ru')).toHaveAttribute('aria-current', 'false');
  await page.getByTestId('chat-input').fill('مرحبا');
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-bubble-assistant')).toHaveCount(2);
  expect(turns[1].language).toBe('ar');

  await page.reload();
  await expect(page.getByTestId('start-language-ar')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('entry-basic').click();
  await openChat(page);
  await expect(page.getByTestId('chat-language')).toHaveValue('ar');
  await expect(page.locator('#chat-body')).toHaveAttribute('dir', 'rtl');
});
