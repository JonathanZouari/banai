import { test, expect, openChat, openDesigner } from './fixtures.js';

// The OpenAI key lives only in this browser. Both backend calls that receive it are mocked with
// page.route, so these tests need no real key and never reach OpenAI.
const STORAGE_KEY = 'banai.openaiApiKey';
const KEY = 'sk-test-e2eKey0123456789abcdefWXYZ';

const envelope = (data) => ({
  status: 200,
  contentType: 'application/json',
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({ success: true, data, error: null }),
});

/** Answers POST /api/settings/ai/verify with `status`; returns the keys it was asked to check. */
async function mockVerify(page, status) {
  const checked = [];
  await page.route('**/api/settings/ai/verify', async (route) => {
    checked.push(route.request().postDataJSON().apiKey);
    await route.fulfill(envelope({ status, model: 'gpt-test-mini', maskedKey: 'sk-...WXYZ', checkedAt: '2026-10-16T09:30:00+00:00' }));
  });
  return checked;
}

const seedKey = (page) => page.addInitScript(([name, key]) => localStorage.setItem(name, key), [STORAGE_KEY, KEY]);
const storedKey = (page) => page.evaluate((name) => localStorage.getItem(name), STORAGE_KEY);
const revision = (page) => page.evaluate(() => window.__banai.store.getState().revision);

test.describe('AI settings (OpenAI key kept in this browser only)', () => {
  test('the chat status chip opens AI settings; a working key connects and is stored only locally', async ({ page }) => {
    const checked = await mockVerify(page, 'connected');
    await openDesigner(page);
    await openChat(page);
    const chip = page.getByTestId('chat-status');
    await expect(chip).toHaveText('לא מחובר');
    await expect(page.getByTestId('chat-connect-key')).toBeVisible();

    await chip.click();
    const dialog = page.getByTestId('ai-settings-dialog');
    await expect(dialog).toBeVisible();
    const input = page.getByTestId('ai-key-input');
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('type', 'password');
    await input.fill(KEY);
    await page.getByTestId('ai-key-save').click();

    await expect(page.getByTestId('ai-settings-status')).toHaveText('המפתח מחובר');
    await expect(chip).toHaveText('המפתח מחובר');
    await expect(input).toHaveValue('');
    await expect(page.getByTestId('ai-settings-key')).toContainText('מפתח sk-...WXYZ');
    expect(await storedKey(page)).toBe(KEY);
    expect(checked).toEqual([KEY]);
    // Only the masked key is ever shown.
    expect(await page.locator('body').innerText()).not.toContain(KEY);

    await page.getByTestId('ai-settings-close').click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('chat-connect-key')).toBeHidden();
  });

  test('a key OpenAI rejects shows the error and is not stored; a malformed key never reaches the server', async ({ page }) => {
    const checked = await mockVerify(page, 'invalid_key');
    await openDesigner(page);
    await openChat(page);
    await page.getByTestId('chat-status').click();
    const input = page.getByTestId('ai-key-input');
    const error = page.getByTestId('ai-settings-dialog').getByRole('alert');

    await input.fill(KEY);
    await page.getByTestId('ai-key-save').click();
    await expect(error).toHaveText('OpenAI דחה את המפתח. בדקו אותו או צרו מפתח חדש. המפתח לא נשמר.');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('ai-settings-status')).toHaveText('לא מחובר');
    await expect(page.getByTestId('chat-status')).toHaveText('לא מחובר');
    expect(await storedKey(page)).toBeNull();
    expect(checked).toEqual([KEY]);

    await input.fill('my-password-123');
    await page.getByTestId('ai-key-save').click();
    await expect(error).toHaveText('זה לא נראה כמו מפתח OpenAI API (הוא מתחיל ב-sk-).');
    expect(await storedKey(page)).toBeNull();
    expect(checked).toEqual([KEY]);
  });

  test('a stored key is re-checked on load, and Remove key forgets it', async ({ page }) => {
    const checked = await mockVerify(page, 'connected');
    const chatCalls = [];
    await page.route('**/api/chat', (route) => {
      chatCalls.push(route.request().postDataJSON());
      return route.abort();
    });
    await seedKey(page);
    await openDesigner(page);
    await openChat(page);
    const chip = page.getByTestId('chat-status');
    await expect(chip).toHaveText('המפתח מחובר');
    expect(checked).toEqual([KEY]);

    await chip.click();
    await expect(page.getByTestId('ai-settings-key')).toContainText('sk-...WXYZ');
    await page.getByTestId('ai-key-remove').click();
    await expect(page.getByTestId('ai-settings-status')).toHaveText('לא מחובר');
    await expect(page.getByTestId('ai-key-remove')).toBeHidden();
    await expect(page.getByTestId('ai-settings-key')).toBeHidden();
    await expect(chip).toHaveText('לא מחובר');
    expect(await storedKey(page)).toBeNull();

    // Without a key the chat says so honestly and sends nothing to the backend.
    await page.getByTestId('ai-settings-close').click();
    await expect(page.getByTestId('chat-connect-key')).toBeVisible();
    await page.getByTestId('chat-input').fill('two drawers please');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-messages')).toContainText('עוד לא מחובר');
    expect(chatCalls).toEqual([]);
  });
});

test.describe('AI chat with a connected key (agent mocked)', () => {
  test('a turn shows the typing indicator, then the reply; the key and history travel with each request', async ({ page }) => {
    await mockVerify(page, 'connected');
    const requests = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const replies = ['בטח! ארון ברוחב 240 ס"מ עם שלוש מגירות.', 'אפשר להוסיף מראה על הדלת האמצעית.'];
    await page.route('**/api/chat', async (route) => {
      requests.push(route.request().postDataJSON());
      await gate;
      await route.fulfill(envelope({ reply: replies[requests.length - 1], model: 'gpt-test-mini' }));
    });
    await seedKey(page);
    await openDesigner(page);
    await openChat(page);
    await expect(page.getByTestId('chat-status')).toHaveText('המפתח מחובר');
    const before = await revision(page);

    await page.getByTestId('chat-input').fill('אני רוצה ארון ברוחב 240');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-bubble-user')).toHaveText('אני רוצה ארון ברוחב 240');
    await expect(page.getByTestId('chat-typing')).toBeVisible();
    await expect(page.getByTestId('chat-send')).toBeDisabled();
    await expect(page.getByTestId('chat-bubble-assistant')).toHaveCount(0);

    release();
    const assistant = page.getByTestId('chat-bubble-assistant');
    await expect(assistant).toHaveText(replies[0]);
    await expect(assistant.locator('span')).toHaveAttribute('dir', 'auto');
    await expect(page.getByTestId('chat-typing')).toBeHidden();
    await expect(page.getByTestId('chat-send')).toBeEnabled();
    // The agent sees the committed design and its revision (ADR-020), next to the key and the history.
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ apiKey: KEY, messages: [{ role: 'user', content: 'אני רוצה ארון ברוחב 240' }], revision: before });
    expect(requests[0].design).toEqual(await page.evaluate(() => window.__banai.store.getState().design));

    // The next turn carries the conversation so far.
    await page.getByTestId('chat-input').fill('ועם מראה?');
    await page.getByTestId('chat-input').press('Enter');
    await expect(assistant).toHaveCount(2);
    await expect(assistant.nth(1)).toHaveText(replies[1]);
    expect(requests[1].messages).toEqual([
      { role: 'user', content: 'אני רוצה ארון ברוחב 240' },
      { role: 'assistant', content: replies[0] },
      { role: 'user', content: 'ועם מראה?' },
    ]);
    // Text replies never change the design.
    expect(await revision(page)).toBe(before);
  });
});
