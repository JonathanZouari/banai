import { test, expect, openDesigner } from './fixtures.js';

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
    const chip = page.getByTestId('chat-status');
    await expect(chip).toHaveText('Not connected');
    await expect(page.getByTestId('chat-connect-key')).toBeVisible();

    await chip.click();
    const dialog = page.getByTestId('ai-settings-dialog');
    await expect(dialog).toBeVisible();
    const input = page.getByTestId('ai-key-input');
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('type', 'password');
    await input.fill(KEY);
    await page.getByTestId('ai-key-save').click();

    await expect(page.getByTestId('ai-settings-status')).toHaveText('Key connected');
    await expect(chip).toHaveText('Key connected');
    await expect(input).toHaveValue('');
    await expect(page.getByTestId('ai-settings-key')).toContainText('Key sk-...WXYZ');
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
    await page.getByTestId('chat-status').click();
    const input = page.getByTestId('ai-key-input');
    const error = page.getByTestId('ai-settings-dialog').getByRole('alert');

    await input.fill(KEY);
    await page.getByTestId('ai-key-save').click();
    await expect(error).toHaveText('OpenAI rejected this key. Check it or create a new one. The key was not saved.');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('ai-settings-status')).toHaveText('Not connected');
    await expect(page.getByTestId('chat-status')).toHaveText('Not connected');
    expect(await storedKey(page)).toBeNull();
    expect(checked).toEqual([KEY]);

    await input.fill('my-password-123');
    await page.getByTestId('ai-key-save').click();
    await expect(error).toHaveText("That doesn't look like an OpenAI API key (it starts with sk-).");
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
    const chip = page.getByTestId('chat-status');
    await expect(chip).toHaveText('Key connected');
    expect(checked).toEqual([KEY]);

    await chip.click();
    await expect(page.getByTestId('ai-settings-key')).toContainText('sk-...WXYZ');
    await page.getByTestId('ai-key-remove').click();
    await expect(page.getByTestId('ai-settings-status')).toHaveText('Not connected');
    await expect(page.getByTestId('ai-key-remove')).toBeHidden();
    await expect(page.getByTestId('ai-settings-key')).toBeHidden();
    await expect(chip).toHaveText('Not connected');
    expect(await storedKey(page)).toBeNull();

    // Without a key the chat says so honestly and sends nothing to the backend.
    await page.getByTestId('ai-settings-close').click();
    await expect(page.getByTestId('chat-connect-key')).toBeVisible();
    await page.getByTestId('chat-input').fill('two drawers please');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-messages')).toContainText("isn't connected yet");
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
    await expect(page.getByTestId('chat-status')).toHaveText('Key connected');
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
    expect(requests).toEqual([{ apiKey: KEY, messages: [{ role: 'user', content: 'אני רוצה ארון ברוחב 240' }] }]);

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
