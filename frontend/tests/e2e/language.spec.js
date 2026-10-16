import { test, expect, openDesigner } from './fixtures.js';

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
const send = async (page, text) => { await page.getByTestId('chat-input').fill(text); await page.getByTestId('chat-send').click(); };

test.describe('assistant language switch', () => {
  test('Hebrew makes the chat panel RTL, sends language=he and survives a reload', async ({ page }) => {
    const bodies = [];
    await page.route('**/api/chat', (route) => {
      bodies.push(route.request().postDataJSON());
      return route.fulfill(ok({ reply: 'שלום!', proposal: null }));
    });
    await openDesigner(page);
    const panel = page.locator('#chat-panel');
    await expect(panel).toHaveAttribute('dir', 'ltr');
    await expect(page.getByTestId('lang-en')).toHaveAttribute('aria-checked', 'true');

    await page.getByTestId('lang-he').click();
    await expect(panel).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('chat-welcome')).toContainText('מה נעצב היום?');
    await expect(page.getByTestId('chat-input')).toHaveAttribute('placeholder', /תארו/);

    await send(page, '240 ס״מ');
    await expect(page.getByTestId('chat-messages')).toContainText('שלום!');
    expect(bodies[0].language).toBe('he');

    await page.reload();
    await page.getByTestId('entry-basic').click();
    await expect(page.locator('#chat-panel')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('lang-he')).toHaveAttribute('aria-checked', 'true');
  });

  test('switching back to English restores the English panel and sends language=en', async ({ page }) => {
    const bodies = [];
    await page.route('**/api/chat', (route) => {
      bodies.push(route.request().postDataJSON());
      return route.fulfill(ok({ reply: 'Hello', proposal: null }));
    });
    await openDesigner(page);
    await page.getByTestId('lang-he').click();
    await page.getByTestId('lang-en').click();
    await expect(page.locator('#chat-panel')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByTestId('chat-welcome')).toContainText('What shall we design today?');
    await send(page, 'hello');
    await expect(page.getByTestId('chat-messages')).toContainText('Hello');
    expect(bodies[0].language).toBe('en');
  });
});
